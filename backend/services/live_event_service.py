"""Live event service — DB-backed events from LMSR and external feeds."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.live_event import EventUpdate, LiveEvent, LiveEventSource, LiveEventStatus
from app.models.account import StockExpirationType
from app.runtime.serializers import serialize_market
from app.runtime.store import get_trading_store
from integrations.kalshi import KalshiError, get_kalshi_service
from integrations.polymarket import PolymarketError, get_polymarket_service
from realtime.event_broadcaster import broadcast_live_event_changes, broadcast_new_event
from tasks.providers.base import IngestedEventSnapshot

logger = logging.getLogger(__name__)

_STATUS_MAP = {
    "open": LiveEventStatus.OPEN,
    "closing_soon": LiveEventStatus.CLOSING_SOON,
    "resolved": LiveEventStatus.RESOLVED,
}


def _coerce_expiration_type(value: Any) -> StockExpirationType | None:
    if value is None:
        return None
    if isinstance(value, StockExpirationType):
        return value
    text = str(value).strip().lower().replace("-", "")
    if text in {"0dte", "zerodte"}:
        return StockExpirationType.ZERO_DTE
    if text == "weekly":
        return StockExpirationType.WEEKLY
    return None


def _coerce_expiration_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    if "T" in text:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    return date.fromisoformat(text[:10])


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


def _source_from_string(value: str) -> LiveEventSource:
    try:
        return LiveEventSource(value)
    except ValueError:
        return LiveEventSource.INTERNAL


def _market_to_event_fields(market: dict[str, Any]) -> dict[str, Any]:
    source_raw = str(market.get("source", market.get("provider", "internal")))
    source = _source_from_string(source_raw)
    status_raw = str(market.get("status", "open"))
    status = _STATUS_MAP.get(status_raw, LiveEventStatus.OPEN)

    fields: dict[str, Any] = {
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
        "stock_ticker": None,
        "strike_price": None,
        "expiration_type": None,
        "expiration_date": None,
    }

    ticker = market.get("stockTicker") or market.get("stock_ticker")
    if ticker:
        fields["stock_ticker"] = str(ticker).strip().upper()
    if market.get("strikePrice") is not None or market.get("strike_price") is not None:
        raw_strike = market.get("strikePrice")
        if raw_strike is None:
            raw_strike = market.get("strike_price")
        fields["strike_price"] = float(raw_strike)
    fields["expiration_type"] = _coerce_expiration_type(
        market.get("expirationType") or market.get("expiration_type")
    )
    fields["expiration_date"] = _coerce_expiration_date(
        market.get("expirationDate") or market.get("expiration_date")
    )
    return fields


def _stock_meta_str(metadata: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = metadata.get(key)
        if value:
            return str(value).strip().upper()
    return None


def _stock_meta_float(metadata: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = metadata.get(key)
        if value is not None:
            return float(value)
    return None


@dataclass
class IngestResult:
    event: LiveEvent
    created: bool
    changed: bool


class LiveEventService:
    """Coordinates live events across the database, LMSR runtime, and Polymarket."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def sync_from_sources(self, *, polymarket_limit: int = 100, kalshi_limit: int = 100) -> int:
        """Upsert live events from internal LMSR, Polymarket, and Kalshi."""
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

        if kalshi_limit > 0:
            try:
                kalshi_markets = await asyncio.wait_for(
                    get_kalshi_service().get_active_markets(),
                    timeout=5.0,
                )
                kalshi_markets.sort(
                    key=lambda market: float(market.get("volume24h") or market.get("volume") or 0.0),
                    reverse=True,
                )
                markets.extend(kalshi_markets[:kalshi_limit])
            except (KalshiError, TimeoutError, asyncio.TimeoutError):
                logger.warning("Kalshi unavailable during live event sync")

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

    async def _refresh_polymarket_snapshot(self, event: LiveEvent) -> None:
        """Pull the latest Polymarket quote into the persisted row."""
        if event.source != LiveEventSource.POLYMARKET:
            return

        try:
            market = await get_polymarket_service().get_market_by_id(event.external_id)
        except PolymarketError:
            return

        if market is None:
            return

        fields = _market_to_event_fields(market)
        event.probabilities = fields["probabilities"]
        event.volume = fields["volume"]
        event.volume_24h = fields["volume_24h"]
        event.change_24h = fields["change_24h"]
        event.status = fields["status"]
        event.question = fields["question"] or event.question

    async def _refresh_kalshi_snapshot(self, event: LiveEvent) -> None:
        """Pull the latest Kalshi quote into the persisted row."""
        if event.source != LiveEventSource.KALSHI:
            return

        try:
            market = await asyncio.wait_for(
                get_kalshi_service().get_market_by_id(event.external_id, refresh=True),
                timeout=5.0,
            )
        except (KalshiError, TimeoutError, asyncio.TimeoutError):
            return

        if market is None:
            return

        fields = _market_to_event_fields(market)
        event.probabilities = fields["probabilities"]
        event.volume = fields["volume"]
        event.volume_24h = fields["volume_24h"]
        event.change_24h = fields["change_24h"]
        event.status = fields["status"]
        event.question = fields["question"] or event.question

    async def _refresh_event_snapshot(self, event: LiveEvent) -> None:
        if event.source == LiveEventSource.INTERNAL:
            await self._refresh_internal_snapshot(event)
        elif event.source == LiveEventSource.POLYMARKET:
            await self._refresh_polymarket_snapshot(event)
        elif event.source == LiveEventSource.KALSHI:
            await self._refresh_kalshi_snapshot(event)
        elif event.source == LiveEventSource.SP500_DYNAMIC:
            await self._refresh_sp500_snapshot(event)

    async def _refresh_sp500_snapshot(self, event: LiveEvent) -> None:
        """Ensure the Alpaca quote bridge is subscribed for this event's ticker.

        Probability odds stay LMSR-driven; underlying equity price is streamed
        separately as ``stock_quote`` messages.

        Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
        """
        ticker = (event.stock_ticker or "").strip().upper()
        if not ticker:
            return
        try:
            from services.alpaca_quote_bridge import get_alpaca_quote_bridge

            await get_alpaca_quote_bridge().touch_ticker(ticker)
        except Exception:  # noqa: BLE001
            logger.debug("Alpaca quote bridge unavailable for %s", ticker, exc_info=True)

    async def record_view(self, event_id: str) -> LiveEvent | None:
        """Record a card view and subscribe Alpaca IEX for sp500_dynamic tickers."""
        from services.live_feed_analytics import analytics

        event = await self._resolve_event(event_id)
        if event is None:
            return None

        ticker = (event.stock_ticker or "").strip().upper() or None
        analytics.record_event_view(event.id, stock_ticker=ticker)

        if event.source == LiveEventSource.SP500_DYNAMIC and ticker:
            await self._refresh_sp500_snapshot(event)

        return event

    def _count_by_source(self, events: list[LiveEvent]) -> dict[str, int]:
        counts = {
            "internal": 0,
            "polymarket": 0,
            "kalshi": 0,
            "sp500_dynamic": 0,
            "external": 0,
        }
        for event in events:
            key = event.source.value
            if key in counts:
                counts[key] += 1
        return counts

    def _apply_source_filter(
        self,
        events: list[LiveEvent],
        source: str,
    ) -> list[LiveEvent]:
        if not source or source == "all":
            return events
        return [event for event in events if event.source.value == source]

    async def get_combined_feed(
        self,
        *,
        category: str = "all",
        source: str = "all",
        sync: bool = True,
    ) -> tuple[list[LiveEvent], dict[str, int]]:
        """Return a unified internal + Polymarket feed with per-source counts."""
        if sync:
            await self.sync_from_sources()

        stmt = select(LiveEvent).order_by(LiveEvent.volume.desc(), LiveEvent.question)
        if category and category != "all":
            stmt = stmt.where(LiveEvent.category == category)

        result = await self.db.execute(stmt)
        events = list(result.scalars().all())

        for event in events:
            await self._refresh_event_snapshot(event)

        await self.db.commit()
        counts = self._count_by_source(events)
        filtered = self._apply_source_filter(events, source)
        return filtered, counts

    async def get_all_live_events(self, *, sync: bool = True) -> list[LiveEvent]:
        events, _ = await self.get_combined_feed(sync=sync)
        return events

    async def get_events_by_category(self, category: str, *, sync: bool = True) -> list[LiveEvent]:
        events, _ = await self.get_combined_feed(category=category, sync=sync)
        return events

    async def ingest_snapshot(
        self,
        snapshot: IngestedEventSnapshot,
        *,
        broadcast: bool = True,
    ) -> IngestResult:
        """Upsert a provider snapshot and broadcast when values change."""
        probabilities = _normalize_probabilities(snapshot.probabilities)
        status = _STATUS_MAP.get(snapshot.status, LiveEventStatus.OPEN)
        source = _source_from_string(snapshot.source)

        result = await self.db.execute(
            select(LiveEvent).where(LiveEvent.external_id == snapshot.external_id)
        )
        event = result.scalar_one_or_none()

        if event is None:
            event = LiveEvent(
                external_id=snapshot.external_id,
                source=source,
                category=snapshot.category,
                status=status,
                question=snapshot.question,
                probabilities=probabilities,
                volume=snapshot.volume,
                volume_24h=snapshot.volume_24h,
                change_24h=snapshot.change_24h,
                stock_ticker=_stock_meta_str(snapshot.metadata, "stock_ticker", "stockTicker"),
                strike_price=_stock_meta_float(snapshot.metadata, "strike_price", "strikePrice"),
                expiration_type=_coerce_expiration_type(
                    snapshot.metadata.get("expiration_type")
                    or snapshot.metadata.get("expirationType")
                ),
                expiration_date=_coerce_expiration_date(
                    snapshot.metadata.get("expiration_date")
                    or snapshot.metadata.get("expirationDate")
                ),
            )
            self.db.add(event)
            await self.db.commit()
            await self.db.refresh(event)

            if broadcast:
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

            return IngestResult(event=event, created=True, changed=True)

        before_probs = dict(event.probabilities or {})
        before_status = event.status.value
        before_volume = event.volume

        event.source = source
        event.category = snapshot.category
        event.status = status
        event.question = snapshot.question or event.question
        event.probabilities = probabilities
        event.volume = snapshot.volume
        event.volume_24h = snapshot.volume_24h
        event.change_24h = snapshot.change_24h
        ticker = _stock_meta_str(snapshot.metadata, "stock_ticker", "stockTicker")
        if ticker:
            event.stock_ticker = ticker
        strike = _stock_meta_float(snapshot.metadata, "strike_price", "strikePrice")
        if strike is not None:
            event.strike_price = strike
        exp_type = _coerce_expiration_type(
            snapshot.metadata.get("expiration_type") or snapshot.metadata.get("expirationType")
        )
        if exp_type is not None:
            event.expiration_type = exp_type
        exp_date = _coerce_expiration_date(
            snapshot.metadata.get("expiration_date") or snapshot.metadata.get("expirationDate")
        )
        if exp_date is not None:
            event.expiration_date = exp_date

        prob_changed = before_probs != probabilities
        status_changed = before_status != event.status.value
        volume_delta = max(0.0, event.volume - before_volume)
        changed = prob_changed or status_changed or volume_delta > 0

        if prob_changed:
            self.db.add(
                EventUpdate(
                    event_id=event.id,
                    probabilities_before=before_probs,
                    probabilities_after=probabilities,
                    volume_delta=volume_delta,
                )
            )

        await self.db.commit()
        await self.db.refresh(event)

        if broadcast and changed:
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
                previous_status=before_status if status_changed else None,
                previous_probabilities=before_probs if prob_changed else None,
                volume_delta=volume_delta,
            )

        return IngestResult(event=event, created=False, changed=changed)

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
        # Push live P&L marks to traders holding this market.
        try:
            from services.portfolio_service import get_portfolio_service

            yes = float((event.probabilities or {}).get("yes") or 0.5)
            await get_portfolio_service().broadcast_marks_for_market(
                str(event.external_id or event.id),
                yes_price=yes,
            )
            if event.external_id and str(event.id) != str(event.external_id):
                await get_portfolio_service().broadcast_marks_for_market(
                    str(event.id),
                    yes_price=yes,
                )
        except Exception:  # noqa: BLE001
            logger.debug("Portfolio mark broadcast skipped", exc_info=True)
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
