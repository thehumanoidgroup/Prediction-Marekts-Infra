"""Live event service — DB-backed events from LMSR and external feeds."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.live_event import EventUpdate, LiveEvent, LiveEventSource, LiveEventStatus
from app.runtime.serializers import serialize_market
from app.runtime.store import get_trading_store
from integrations.polymarket import PolymarketError, get_polymarket_service
from realtime.event_broadcaster import broadcast_live_event_changes, broadcast_new_event

logger = logging.getLogger(__name__)

_STATUS_MAP = {
    "open": LiveEventStatus.OPEN,
    "closing_soon": LiveEventStatus.CLOSING_SOON,
    "resolved": LiveEventStatus.RESOLVED,
}


def _normalize_probabilities(raw: dict[str, Any] | None) -> dict[str, float]:
    """Accept yes/no or yesPrice/noPrice keys and return normalized probabilities."""
    if not raw:
        return {"yes": 0.5, "no": 0.5}

    yes = raw.get("yes")
    if yes is None:
        yes = raw.get("yesPrice")
    no = raw.get("no")
    if no is None:
        no = raw.get("noPrice")

    if yes is None and no is not None:
        yes = 1.0 - float(no)
    elif yes is not None and no is None:
        no = 1.0 - float(yes)
    elif yes is None:
        yes = 0.5
        no = 0.5

    yes_f = min(0.97, max(0.03, float(yes)))
    no_f = min(0.97, max(0.03, float(no)))
    total = yes_f + no_f
    if total <= 0:
        return {"yes": 0.5, "no": 0.5}
    return {"yes": round(yes_f / total, 4), "no": round(no_f / total, 4)}


def _market_to_event_fields(market: dict[str, Any]) -> dict[str, Any]:
    source_raw = market.get("source", "internal")
    source = LiveEventSource.POLYMARKET if source_raw == "polymarket" else LiveEventSource.INTERNAL
    status_raw = str(market.get("status", "open"))
    status = _STATUS_MAP.get(status_raw, LiveEventStatus.OPEN)

    return {
        "external_id": str(market["id"]),
        "source": source,
        "category": str(market.get("category", "economics")),
        "status": status,
        "question": str(market.get("question", "")),
        "probabilities": _normalize_probabilities(
            {
                "yesPrice": market.get("yesPrice"),
                "noPrice": market.get("noPrice"),
            }
        ),
        "volume": float(market.get("volume") or 0.0),
        "volume_24h": float(market.get("volume24h") or 0.0),
        "change_24h": float(market.get("change24h") or 0.0),
    }


class LiveEventService:
    """Coordinates live events across the database, LMSR runtime, and Polymarket."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def sync_from_sources(self, *, polymarket_limit: int = 100) -> int:
        """Upsert live events from internal LMSR and a capped Polymarket slice."""
        markets: list[dict[str, Any]] = [
            serialize_market(market)
            for market in get_trading_store().list_markets(category="all", query="", sort="volume")
        ]

        if polymarket_limit > 0:
            try:
                poly_markets = await get_polymarket_service().get_active_markets()
                poly_markets.sort(
                    key=lambda market: float(market.get("volume24h") or market.get("volume") or 0.0),
                    reverse=True,
                )
                markets.extend(poly_markets[:polymarket_limit])
            except PolymarketError:
                logger.warning("Polymarket unavailable during live event sync; using internal only")

        upserted = 0
        for market in markets:
            fields = _market_to_event_fields(market)
            if not fields["question"]:
                continue

            result = await self.db.execute(
                select(LiveEvent).where(LiveEvent.external_id == fields["external_id"])
            )
            event = result.scalar_one_or_none()
            if event is None:
                event = LiveEvent(**fields)
                self.db.add(event)
                upserted += 1
                await self.db.flush()
                await broadcast_new_event(
                    event.id,
                    question=event.question,
                    category=event.category,
                    status=event.status.value,
                    probabilities=dict(event.probabilities or {}),
                    source=event.source.value,
                    external_id=event.external_id,
                    volume=event.volume,
                    volume_24h=event.volume_24h,
                )
            else:
                for key, value in fields.items():
                    setattr(event, key, value)

        await self.db.commit()
        return upserted

    async def _resolve_event(self, event_id: str) -> LiveEvent | None:
        result = await self.db.execute(select(LiveEvent).where(LiveEvent.id == event_id))
        event = result.scalar_one_or_none()
        if event is not None:
            return event

        result = await self.db.execute(
            select(LiveEvent).where(LiveEvent.external_id == event_id)
        )
        return result.scalar_one_or_none()

    async def _refresh_internal_snapshot(self, event: LiveEvent) -> None:
        """Pull the latest LMSR quote into the persisted row."""
        if event.source != LiveEventSource.INTERNAL:
            return

        runtime = get_trading_store().get_market(event.external_id)
        if runtime is None:
            return

        snapshot = serialize_market(runtime)
        event.probabilities = _normalize_probabilities({"yesPrice": snapshot["yesPrice"]})
        event.volume = float(snapshot.get("volume") or event.volume)
        event.volume_24h = float(snapshot.get("volume24h") or event.volume_24h)
        event.change_24h = float(snapshot.get("change24h") or event.change_24h)
        event.status = _STATUS_MAP.get(str(snapshot.get("status", "open")), event.status)

    async def get_all_live_events(self, *, sync: bool = True) -> list[LiveEvent]:
        if sync:
            await self.sync_from_sources()

        result = await self.db.execute(
            select(LiveEvent).order_by(LiveEvent.volume.desc(), LiveEvent.question)
        )
        events = list(result.scalars().all())

        for event in events:
            await self._refresh_internal_snapshot(event)

        await self.db.commit()
        return events

    async def get_events_by_category(self, category: str, *, sync: bool = True) -> list[LiveEvent]:
        if sync:
            await self.sync_from_sources()

        stmt = select(LiveEvent).order_by(LiveEvent.volume.desc(), LiveEvent.question)
        if category and category != "all":
            stmt = stmt.where(LiveEvent.category == category)

        result = await self.db.execute(stmt)
        events = list(result.scalars().all())

        for event in events:
            await self._refresh_internal_snapshot(event)

        await self.db.commit()
        return events

    async def update_event_probability(
        self,
        event_id: str,
        new_prices: dict[str, Any],
        *,
        volume_delta: float = 0.0,
    ) -> LiveEvent | None:
        event = await self._resolve_event(event_id)
        if event is None:
            return None

        before = dict(event.probabilities or {})
        before_status = event.status.value
        before_volume = event.volume
        after = _normalize_probabilities(new_prices)

        if event.source == LiveEventSource.INTERNAL:
            get_trading_store().apply_price_tick(event.external_id, after["yes"])
            runtime = get_trading_store().get_market(event.external_id)
            if runtime is not None:
                snapshot = serialize_market(runtime)
                event.volume = float(snapshot.get("volume") or event.volume)
                event.volume_24h = float(snapshot.get("volume24h") or event.volume_24h)
                event.change_24h = float(snapshot.get("change24h") or event.change_24h)
                event.status = _STATUS_MAP.get(str(snapshot.get("status", "open")), event.status)

        event.probabilities = after
        event.volume = max(0.0, event.volume + volume_delta)
        if volume_delta:
            event.volume_24h = max(0.0, event.volume_24h + volume_delta)

        self.db.add(
            EventUpdate(
                event_id=event.id,
                probabilities_before=before,
                probabilities_after=after,
                volume_delta=volume_delta,
            )
        )
        await self.db.commit()
        await self.db.refresh(event)

        await broadcast_live_event_changes(
            event_id=event.id,
            external_id=event.external_id,
            category=event.category,
            source=event.source.value,
            probabilities=dict(event.probabilities or {}),
            volume=event.volume,
            volume_24h=event.volume_24h,
            change_24h=event.change_24h,
            status=event.status.value,
            previous_status=before_status if before_status != event.status.value else None,
            previous_probabilities=before if before != event.probabilities else None,
            volume_delta=volume_delta if volume_delta > 0 else max(0.0, event.volume - before_volume),
        )
        return event

    async def broadcast_event_update(self, event_id: str, update_data: dict[str, Any]) -> None:
        """Fan out structured live event updates through the real-time broadcaster."""
        event = await self._resolve_event(event_id)
        if event is None:
            return

        await broadcast_live_event_changes(
            event_id=event.id,
            external_id=event.external_id,
            category=event.category,
            source=event.source.value,
            probabilities=dict(event.probabilities or {}),
            volume=float(update_data.get("volume", event.volume)),
            volume_24h=float(update_data.get("volume_24h", event.volume_24h)),
            change_24h=float(update_data.get("change_24h", event.change_24h)),
            status=str(update_data.get("status", event.status.value)),
            previous_probabilities=update_data.get("previous_probabilities"),
            previous_status=update_data.get("previous_status"),
            volume_delta=float(update_data.get("volume_delta", 0.0)),
        )


def get_live_event_service(db: AsyncSession) -> LiveEventService:
    return LiveEventService(db)
