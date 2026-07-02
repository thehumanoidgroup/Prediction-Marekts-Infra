import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from typing import Any

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import get_settings

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "pp:markets:"


class ConnectionManager:
    """Tenant-aware WebSocket fan-out.

    Local connections are grouped per tenant. When Redis is reachable,
    messages are published through pub/sub so every API replica delivers
    them; without Redis (bare local dev) it degrades to in-process fan-out.
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
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

    async def connect(self, tenant_slug: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[tenant_slug].add(websocket)

    async def disconnect(self, tenant_slug: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[tenant_slug].discard(websocket)

    async def broadcast(self, tenant_slug: str, message: dict[str, Any]) -> None:
        """Publishes to all replicas via Redis, or locally as a fallback."""
        if self._redis:
            try:
                await self._redis.publish(CHANNEL_PREFIX + tenant_slug, json.dumps(message))
                return
            except Exception:  # noqa: BLE001
                logger.exception("Redis publish failed; delivering locally")
        await self._deliver_local(tenant_slug, message)

    async def _deliver_local(self, tenant_slug: str, message: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._connections[tenant_slug])
        payload = json.dumps(message)
        for socket in sockets:
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
