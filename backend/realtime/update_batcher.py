"""Coalesce high-frequency live event broadcasts into batched WebSocket frames."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from typing import Any

from app.core.config import get_settings
from app.ws.manager import manager
from services.live_feed_analytics import analytics

logger = logging.getLogger(__name__)


def _event_key(message: dict[str, Any]) -> str:
    return str(message.get("event_id") or message.get("market_id") or "")


def _price_delta(message: dict[str, Any]) -> float | None:
    if message.get("type") != "price_update":
        return None
    data = message.get("data") or {}
    probabilities = data.get("probabilities") or {}
    yes = probabilities.get("yes")
    if yes is None:
        return None
    return float(yes)


class UpdateBatcher:
    """Buffers per-tenant updates and flushes them on a fixed interval."""

    def __init__(self) -> None:
        self._pending: dict[str, dict[str, dict[str, Any]]] = {}
        self._last_sent_price: dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task[None] | None = None

    async def startup(self) -> None:
        if self._flush_task is None:
            self._flush_task = asyncio.create_task(self._flush_loop())

    async def shutdown(self) -> None:
        if self._flush_task:
            self._flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._flush_task
            self._flush_task = None
        await self.flush()

    async def enqueue(
        self,
        tenant_slug: str,
        message: dict[str, Any],
        *,
        rooms: list[str] | None = None,
    ) -> None:
        settings = get_settings()
        msg_type = str(message.get("type", ""))

        if msg_type == "price_update":
            event_id = _event_key(message)
            yes = _price_delta(message)
            if event_id and yes is not None:
                previous = self._last_sent_price.get(event_id)
                if previous is not None and abs(yes - previous) < settings.ws_min_price_delta:
                    return

        outbound = dict(message)
        if rooms is not None:
            outbound["_rooms"] = list(rooms)
        elif "_rooms" not in outbound:
            outbound["_rooms"] = ["all"]

        key = _event_key(outbound) or f"{msg_type}:{time.time_ns()}"
        async with self._lock:
            tenant_queue = self._pending.setdefault(tenant_slug, {})
            tenant_queue[key] = outbound

        if msg_type in {"price_update", "status_change", "new_event"}:
            event_id = _event_key(outbound)
            if event_id:
                analytics.record_event_update(event_id)

    async def flush(self) -> None:
        async with self._lock:
            snapshot = {
                tenant: list(messages.values()) for tenant, messages in self._pending.items() if messages
            }
            self._pending.clear()

        for tenant_slug, messages in snapshot.items():
            if not messages:
                continue

            for message in messages:
                if message.get("type") == "price_update":
                    yes = _price_delta(message)
                    event_id = _event_key(message)
                    if yes is not None and event_id:
                        self._last_sent_price[event_id] = yes

            if len(messages) == 1:
                await manager.broadcast(tenant_slug, messages[0])
                continue

            rooms = messages[0].get("_rooms", ["all"])
            await manager.broadcast(
                tenant_slug,
                {
                    "type": "batch_update",
                    "updates": [{k: v for k, v in msg.items() if k != "_rooms"} for msg in messages],
                    "ts": int(time.time() * 1000),
                    "_rooms": rooms,
                },
            )

    async def _flush_loop(self) -> None:
        settings = get_settings()
        interval = max(settings.ws_broadcast_batch_ms, 50) / 1000.0
        while True:
            await asyncio.sleep(interval)
            try:
                await self.flush()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                logger.exception("Update batch flush failed")


batcher = UpdateBatcher()
