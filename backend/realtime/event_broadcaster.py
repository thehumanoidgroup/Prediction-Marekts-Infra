"""Real-time live event broadcasting with room-based WebSocket fan-out."""

from __future__ import annotations

import logging
import time
from typing import Any, Literal

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Tenant
from app.ws.manager import manager

logger = logging.getLogger(__name__)

EventMessageType = Literal["price_update", "status_change", "new_event"]


def category_room(category: str) -> str:
    """Room key for category-scoped subscriptions."""
    return f"category:{category}"


def event_room(event_id: str) -> str:
    """Room key for event-specific subscriptions (UUID or external id)."""
    return f"event:{event_id}"


def _target_rooms(
    *,
    category: str | None = None,
    event_id: str | None = None,
    external_id: str | None = None,
) -> list[str]:
    rooms = ["all"]
    if category:
        rooms.append(category_room(category))
    if event_id:
        rooms.append(event_room(event_id))
    if external_id and external_id != event_id:
        rooms.append(event_room(external_id))
    return rooms


async def _active_tenant_slugs(tenant_slugs: list[str] | None = None) -> list[str]:
    if tenant_slugs is not None:
        return tenant_slugs

    async with SessionLocal() as db:
        result = await db.execute(select(Tenant.slug).where(Tenant.is_active))
        return [row[0] for row in result]


async def _broadcast(
    message_type: EventMessageType,
    event_id: str,
    data: dict[str, Any],
    *,
    category: str | None = None,
    external_id: str | None = None,
    tenant_slugs: list[str] | None = None,
) -> None:
    payload = {
        "type": message_type,
        "event_id": event_id,
        "data": data,
        "ts": int(time.time() * 1000),
    }
    rooms = _target_rooms(category=category, event_id=event_id, external_id=external_id)

    slugs = await _active_tenant_slugs(tenant_slugs)
    for slug in slugs:
        await manager.broadcast(slug, payload, rooms=rooms)


async def broadcast_price_update(
    event_id: str,
    *,
    probabilities: dict[str, float],
    category: str | None = None,
    external_id: str | None = None,
    change_24h: float | None = None,
    source: str | None = None,
    tenant_slugs: list[str] | None = None,
) -> None:
    """Push a probability/price change from LMSR or an external feed."""
    data: dict[str, Any] = {"probabilities": probabilities}
    if external_id:
        data["external_id"] = external_id
    if change_24h is not None:
        data["change_24h"] = change_24h
    if source:
        data["source"] = source

    await _broadcast(
        "price_update",
        event_id,
        data,
        category=category,
        external_id=external_id,
        tenant_slugs=tenant_slugs,
    )


async def broadcast_status_change(
    event_id: str,
    *,
    status: str,
    category: str | None = None,
    external_id: str | None = None,
    previous_status: str | None = None,
    tenant_slugs: list[str] | None = None,
) -> None:
    """Push when an event status changes (e.g. open → resolved)."""
    data: dict[str, Any] = {"status": status}
    if previous_status:
        data["previous_status"] = previous_status
    if external_id:
        data["external_id"] = external_id

    await _broadcast(
        "status_change",
        event_id,
        data,
        category=category,
        external_id=external_id,
        tenant_slugs=tenant_slugs,
    )


async def broadcast_volume_update(
    event_id: str,
    *,
    volume: float,
    category: str | None = None,
    external_id: str | None = None,
    volume_24h: float | None = None,
    volume_delta: float | None = None,
    tenant_slugs: list[str] | None = None,
) -> None:
    """Push when new trading volume arrives on an event."""
    data: dict[str, Any] = {"volume": volume}
    if volume_24h is not None:
        data["volume_24h"] = volume_24h
    if volume_delta is not None:
        data["volume_delta"] = volume_delta
    if external_id:
        data["external_id"] = external_id

    await _broadcast(
        "new_event",
        event_id,
        data,
        category=category,
        external_id=external_id,
        tenant_slugs=tenant_slugs,
    )


async def broadcast_new_event(
    event_id: str,
    *,
    question: str,
    category: str,
    status: str,
    probabilities: dict[str, float],
    source: str,
    external_id: str | None = None,
    volume: float = 0.0,
    volume_24h: float = 0.0,
    tenant_slugs: list[str] | None = None,
) -> None:
    """Push when a brand-new live event is added to the platform."""
    data: dict[str, Any] = {
        "question": question,
        "category": category,
        "status": status,
        "probabilities": probabilities,
        "source": source,
        "volume": volume,
        "volume_24h": volume_24h,
    }
    if external_id:
        data["external_id"] = external_id

    await _broadcast(
        "new_event",
        event_id,
        data,
        category=category,
        external_id=external_id or event_id,
        tenant_slugs=tenant_slugs,
    )


async def broadcast_live_event_changes(
    *,
    event_id: str,
    external_id: str,
    category: str,
    source: str,
    probabilities: dict[str, float],
    volume: float,
    volume_24h: float,
    change_24h: float,
    status: str,
    previous_status: str | None = None,
    previous_probabilities: dict[str, float] | None = None,
    volume_delta: float = 0.0,
    tenant_slugs: list[str] | None = None,
) -> None:
    """Emit the appropriate real-time messages for a composite event mutation."""
    if previous_probabilities is not None and previous_probabilities != probabilities:
        await broadcast_price_update(
            event_id,
            probabilities=probabilities,
            category=category,
            external_id=external_id,
            change_24h=change_24h,
            source=source,
            tenant_slugs=tenant_slugs,
        )

    if previous_status is not None and previous_status != status:
        await broadcast_status_change(
            event_id,
            status=status,
            previous_status=previous_status,
            category=category,
            external_id=external_id,
            tenant_slugs=tenant_slugs,
        )

    if volume_delta > 0:
        await broadcast_volume_update(
            event_id,
            volume=volume,
            volume_24h=volume_24h,
            volume_delta=volume_delta,
            category=category,
            external_id=external_id,
            tenant_slugs=tenant_slugs,
        )
