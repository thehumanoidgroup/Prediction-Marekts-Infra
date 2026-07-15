import asyncio
import contextlib
import json
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import get_settings
from app.ws.rate_limiter import rate_limiter
from services.live_feed_analytics import analytics

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "pp:markets:"
DEFAULT_ROOM = "all"


@dataclass
class SocketMeta:
    tenant_slug: str
    connected_at: float = field(default_factory=time.time)
    messages_received: int = 0


class ConnectionManager:
    """Tenant-aware WebSocket fan-out with optional room subscriptions.

    Rooms let clients subscribe to tenant-wide feeds (``all``),
    category channels (``category:crypto``), or single events
    (``event:<uuid>`` / ``event:<external_id>``).

    Local connections are grouped per tenant. When Redis is reachable,
    messages are published through pub/sub so every API replica delivers
    them; without Redis (bare local dev) it degrades to in-process fan-out.
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._socket_rooms: dict[WebSocket, set[str]] = {}
        self._socket_meta: dict[WebSocket, SocketMeta] = {}
        self._lock = asyncio.Lock()
        self._redis: aioredis.Redis | None = None
        self._listener_task: asyncio.Task[None] | None = None

    async def startup(self) -> None:
        settings = get_settings()
        try:
            self._redis = aioredis.from_url(
                settings.redis_url, socket_connect_timeout=2, decode_responses=True
            )
            await self._redis.ping()
            self._listener_task = asyncio.create_task(self._listen())
            logger.info("WebSocket manager connected to Redis")
        except Exception:  # noqa: BLE001 - any connection failure falls back
            self._redis = None
            logger.warning("Redis unavailable — WebSocket fan-out is in-process only")

    async def shutdown(self) -> None:
        if self._listener_task:
            self._listener_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listener_task
        if self._redis:
            await self._redis.aclose()

    async def connect(self, tenant_slug: str, websocket: WebSocket) -> bool:
        """Accept a socket when within connection rate and capacity limits."""
        settings = get_settings()

        async with self._lock:
            current = len(self._connections[tenant_slug])
            if current >= settings.ws_max_connections_per_tenant:
                return False

        if not rate_limiter.allow_connection(tenant_slug):
            return False

        await websocket.accept()
        async with self._lock:
            self._connections[tenant_slug].add(websocket)
            self._socket_rooms[websocket] = {DEFAULT_ROOM}
            self._socket_meta[websocket] = SocketMeta(tenant_slug=tenant_slug)

        analytics.record_connection(tenant_slug, connected=True)
        return True

    async def disconnect(self, tenant_slug: str, websocket: WebSocket) -> None:
        async with self._lock:
            had_socket = websocket in self._connections[tenant_slug]
            self._connections[tenant_slug].discard(websocket)
            self._socket_rooms.pop(websocket, None)
            self._socket_meta.pop(websocket, None)

        rate_limiter.clear_socket(websocket)
        if had_socket:
            analytics.record_connection(tenant_slug, connected=False)

    async def register_message(self, websocket: WebSocket) -> bool:
        """Track inbound client messages and enforce per-socket rate limits."""
        if not rate_limiter.allow_message(websocket):
            return False

        async with self._lock:
            meta = self._socket_meta.get(websocket)
            if meta is not None:
                meta.messages_received += 1
        return True

    async def subscribe(self, websocket: WebSocket, rooms: list[str]) -> set[str]:
        """Add room subscriptions for a connected socket."""
        normalized = [room for room in rooms if room]
        async with self._lock:
            subs = self._socket_rooms.setdefault(websocket, {DEFAULT_ROOM})
            subs.update(normalized)
            return set(subs)

    async def unsubscribe(self, websocket: WebSocket, rooms: list[str]) -> set[str]:
        """Remove room subscriptions; falls back to ``all`` if none remain."""
        normalized = [room for room in rooms if room]
        async with self._lock:
            subs = self._socket_rooms.setdefault(websocket, {DEFAULT_ROOM})
            subs.difference_update(normalized)
            if not subs:
                subs.add(DEFAULT_ROOM)
            return set(subs)

    def subscriptions(self, websocket: WebSocket) -> set[str]:
        return set(self._socket_rooms.get(websocket, {DEFAULT_ROOM}))

    async def connection_stats_async(self) -> dict[str, Any]:
        async with self._lock:
            tenants = {
                slug: len(sockets) for slug, sockets in self._connections.items() if sockets
            }
            sockets = []
            for socket, meta in self._socket_meta.items():
                sockets.append(
                    {
                        "tenant_slug": meta.tenant_slug,
                        "connected_at": meta.connected_at,
                        "messages_received": meta.messages_received,
                        "rooms": sorted(self._socket_rooms.get(socket, {DEFAULT_ROOM})),
                    }
                )
        return {
            "total_connections": sum(tenants.values()),
            "connections_by_tenant": tenants,
            "sockets": sockets,
        }

    async def broadcast(
        self,
        tenant_slug: str,
        message: dict[str, Any],
        *,
        rooms: list[str] | None = None,
    ) -> None:
        """Publish to tenant subscribers, optionally scoped to specific rooms."""
        outbound = dict(message)
        if rooms is not None:
            outbound["_rooms"] = list(rooms)
        elif "_rooms" not in outbound:
            outbound["_rooms"] = [DEFAULT_ROOM]

        if self._redis:
            try:
                await self._redis.publish(CHANNEL_PREFIX + tenant_slug, json.dumps(outbound))
                return
            except Exception:  # noqa: BLE001
                logger.exception("Redis publish failed; delivering locally")
        await self._deliver_local(tenant_slug, outbound)

    async def _deliver_local(self, tenant_slug: str, message: dict[str, Any]) -> None:
        target_rooms = set(message.get("_rooms", [DEFAULT_ROOM]))
        client_message = {key: value for key, value in message.items() if key != "_rooms"}
        payload = json.dumps(client_message)

        async with self._lock:
            sockets = list(self._connections[tenant_slug])

        for socket in sockets:
            subscribed = self._socket_rooms.get(socket, {DEFAULT_ROOM})
            if not subscribed & target_rooms:
                continue
            try:
                await socket.send_text(payload)
            except Exception:  # noqa: BLE001 - drop dead sockets
                await self.disconnect(tenant_slug, socket)

    async def _listen(self) -> None:
        assert self._redis is not None
        pubsub = self._redis.pubsub()
        await pubsub.psubscribe(CHANNEL_PREFIX + "*")
        async for item in pubsub.listen():
            if item.get("type") != "pmessage":
                continue
            tenant_slug = item["channel"].removeprefix(CHANNEL_PREFIX)
            try:
                message = json.loads(item["data"])
            except json.JSONDecodeError:
                continue
            await self._deliver_local(tenant_slug, message)


manager = ConnectionManager()
