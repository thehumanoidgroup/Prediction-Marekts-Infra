"""Automated EOD resolution for ``sp500_dynamic`` binary markets.

At end of day (after the NYSE close), for each active 0DTE / weekly market:

1. Fetch the official close via Alpaca ``get_daily_bars``
2. Resolve Yes/No from close vs strike (``close > strike`` → Yes)
3. Payout trader positions with :meth:`VirtualBankroll.settle_market`
4. Persist LiveEvent status + audit rows (with retries)

Alpaca used for MVP. Will switch to Polygon for scale.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.live_event import EventUpdate, LiveEvent, LiveEventSource, LiveEventStatus
from app.models.resolution_audit import MarketResolutionAudit, ResolutionAuditStatus
from app.runtime.catalog import now_ms
from app.runtime.store import TradingStore, get_trading_store
from integrations.alpaca import AlpacaClient, AlpacaError
from realtime.event_broadcaster import broadcast_live_event_changes
from services.sp500_market_generator import session_close_ms

logger = logging.getLogger(__name__)

_ET = ZoneInfo("America/New_York")
PROVIDER = LiveEventSource.SP500_DYNAMIC.value


@dataclass
class Sp500ResolutionResult:
    considered: int = 0
    resolved: int = 0
    skipped: int = 0
    failed: int = 0
    settlements: int = 0
    errors: list[str] = field(default_factory=list)
    details: list[dict[str, Any]] = field(default_factory=list)


def us_equity_today(now: datetime | None = None) -> date:
    current = now.astimezone(_ET) if now else datetime.now(_ET)
    return current.date()


def decide_outcome(close_price: float, strike_price: float) -> int:
    """Map close vs strike to LMSR outcome index.

    Generator questions are ``Will {TICKER} close above {strike}?``
    → Yes (0) when ``close > strike``, else No (1).
    """
    return 0 if float(close_price) > float(strike_price) else 1


def outcome_label(winning_outcome: int) -> str:
    return "yes" if winning_outcome == 0 else "no"


def extract_close(bars: list[dict[str, Any]]) -> float | None:
    if not bars:
        return None
    close = bars[0].get("c")
    if close is None:
        return None
    return float(close)


class Sp500ResolutionService:
    """Resolve expired S&P 500 dynamic markets and settle trader bankrolls."""

    def __init__(
        self,
        *,
        client: AlpacaClient | None = None,
        store: TradingStore | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._client = client
        self._store = store or get_trading_store()
        self._owns_client = client is None

    async def _get_client(self) -> AlpacaClient:
        if self._client is not None:
            return self._client
        self._client = AlpacaClient.from_settings(self._settings)
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    async def list_markets_due(
        self,
        db: AsyncSession,
        *,
        as_of: date | None = None,
        now: int | None = None,
    ) -> list[LiveEvent]:
        """Active sp500_dynamic markets whose session close has passed."""
        as_of_date = as_of or us_equity_today()
        current_ms = now if now is not None else now_ms()

        result = await db.execute(
            select(LiveEvent).where(
                LiveEvent.source == LiveEventSource.SP500_DYNAMIC,
                LiveEvent.status != LiveEventStatus.RESOLVED,
                LiveEvent.expiration_date.isnot(None),
                LiveEvent.expiration_date <= as_of_date,
                LiveEvent.stock_ticker.isnot(None),
                LiveEvent.strike_price.isnot(None),
            )
        )
        events = list(result.scalars().all())
        due: list[LiveEvent] = []
        for event in events:
            assert event.expiration_date is not None
            if session_close_ms(event.expiration_date) <= current_ms:
                due.append(event)
        return due

    async def fetch_close_with_retries(
        self,
        ticker: str,
        bar_date: date,
        *,
        max_retries: int | None = None,
        backoff_seconds: float | None = None,
    ) -> float:
        """Fetch daily close from Alpaca with exponential backoff retries."""
        attempts = max_retries if max_retries is not None else self._settings.sp500_resolution_max_retries
        backoff = (
            backoff_seconds
            if backoff_seconds is not None
            else self._settings.sp500_resolution_retry_backoff_seconds
        )
        client = await self._get_client()
        last_error: Exception | None = None

        for attempt in range(1, max(1, attempts) + 1):
            try:
                bars = await client.get_daily_bars(ticker, bar_date)
                close = extract_close(bars)
                if close is None:
                    raise AlpacaError(
                        f"No daily bar close for {ticker} on {bar_date.isoformat()}"
                    )
                return close
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning(
                    "Alpaca close fetch failed for %s %s (attempt %s/%s): %s",
                    ticker,
                    bar_date,
                    attempt,
                    attempts,
                    exc,
                )
                if attempt < attempts:
                    await asyncio.sleep(backoff * (2 ** (attempt - 1)))

        assert last_error is not None
        raise last_error

    async def resolve_due(
        self,
        db: AsyncSession,
        *,
        as_of: date | None = None,
        broadcast: bool = True,
    ) -> Sp500ResolutionResult:
        """Resolve all due sp500_dynamic markets (idempotent)."""
        result = Sp500ResolutionResult()
        try:
            await self._get_client()
        except AlpacaError as exc:
            result.errors.append(str(exc))
            logger.error("S&P 500 resolution: Alpaca client unavailable: %s", exc)
            return result

        due = await self.list_markets_due(db, as_of=as_of)
        result.considered = len(due)

        for event in due:
            try:
                detail = await self.resolve_one(db, event, broadcast=broadcast)
                result.details.append(detail)
                status = detail.get("status")
                if status == "success":
                    result.resolved += 1
                    result.settlements += int(detail.get("settlements_count") or 0)
                elif status == "skipped":
                    result.skipped += 1
                else:
                    result.failed += 1
                    if detail.get("error"):
                        result.errors.append(str(detail["error"]))
            except Exception as exc:  # noqa: BLE001
                result.failed += 1
                result.errors.append(f"{event.external_id}: {exc}")
                logger.exception("S&P 500 resolution failed for %s", event.external_id)
                await self._write_audit(
                    db,
                    event=event,
                    status=ResolutionAuditStatus.FAILED,
                    attempt=1,
                    error_message=str(exc),
                )

        await db.commit()
        logger.info(
            "S&P 500 resolution finished: considered=%s resolved=%s skipped=%s failed=%s",
            result.considered,
            result.resolved,
            result.skipped,
            result.failed,
        )
        return result

    async def resolve_one(
        self,
        db: AsyncSession,
        event: LiveEvent,
        *,
        broadcast: bool = True,
        max_retries: int | None = None,
    ) -> dict[str, Any]:
        """Resolve a single LiveEvent and settle LMSR bankrolls."""
        if event.status is LiveEventStatus.RESOLVED:
            await self._write_audit(
                db,
                event=event,
                status=ResolutionAuditStatus.SKIPPED,
                attempt=1,
                metadata={"reason": "already_resolved"},
            )
            return {
                "market_id": event.external_id,
                "status": "skipped",
                "reason": "already_resolved",
            }

        ticker = (event.stock_ticker or "").strip().upper()
        strike = event.strike_price
        exp_date = event.expiration_date
        if not ticker or strike is None or exp_date is None:
            await self._write_audit(
                db,
                event=event,
                status=ResolutionAuditStatus.SKIPPED,
                attempt=1,
                error_message="missing ticker/strike/expiration_date",
            )
            return {
                "market_id": event.external_id,
                "status": "skipped",
                "reason": "incomplete_market",
            }

        attempts = max_retries if max_retries is not None else self._settings.sp500_resolution_max_retries
        close_price: float | None = None
        last_error: str | None = None

        for attempt in range(1, max(1, attempts) + 1):
            try:
                close_price = await self.fetch_close_with_retries(
                    ticker,
                    exp_date,
                    max_retries=1,
                )
                break
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                logger.warning(
                    "Resolution attempt %s/%s failed for %s: %s",
                    attempt,
                    attempts,
                    event.external_id,
                    exc,
                )
                if attempt < attempts:
                    await asyncio.sleep(
                        self._settings.sp500_resolution_retry_backoff_seconds * attempt
                    )

        if close_price is None:
            await self._write_audit(
                db,
                event=event,
                status=ResolutionAuditStatus.FAILED,
                attempt=attempts,
                error_message=last_error or "close unavailable",
            )
            return {
                "market_id": event.external_id,
                "status": "failed",
                "error": last_error or "close unavailable",
            }

        winning = decide_outcome(close_price, float(strike))
        label = outcome_label(winning)
        before_probs = dict(event.probabilities or {})
        before_status = event.status.value
        after_probs = {"yes": 1.0, "no": 0.0} if label == "yes" else {"yes": 0.0, "no": 1.0}

        settled = self._store.settle_market_all_sessions(event.external_id, winning)
        settlements_count = sum(len(entries) for _, entries in settled)

        event.status = LiveEventStatus.RESOLVED
        event.probabilities = after_probs
        event.change_24h = float(after_probs["yes"]) - float(before_probs.get("yes") or 0.5)

        db.add(
            EventUpdate(
                event_id=event.id,
                probabilities_before=before_probs,
                probabilities_after=after_probs,
                volume_delta=0.0,
            )
        )

        await self._write_audit(
            db,
            event=event,
            status=ResolutionAuditStatus.SUCCESS,
            attempt=attempts,
            close_price=close_price,
            winning_outcome=label,
            settlements_count=settlements_count,
            metadata={
                "sessions_settled": len(settled),
                "question": event.question,
                "rule": "close > strike → yes",
            },
        )

        await db.flush()

        if broadcast:
            await broadcast_live_event_changes(
                event_id=event.id,
                external_id=event.external_id,
                category=event.category,
                source=event.source.value,
                probabilities=after_probs,
                volume=event.volume,
                volume_24h=event.volume_24h,
                change_24h=event.change_24h,
                status=LiveEventStatus.RESOLVED.value,
                previous_status=before_status,
                previous_probabilities=before_probs,
                volume_delta=0.0,
            )

        logger.info(
            "Resolved %s: %s close=%.4f strike=%.4f → %s (settlements=%s)",
            event.external_id,
            ticker,
            close_price,
            float(strike),
            label,
            settlements_count,
        )
        return {
            "market_id": event.external_id,
            "status": "success",
            "ticker": ticker,
            "close_price": close_price,
            "strike_price": float(strike),
            "winning_outcome": label,
            "settlements_count": settlements_count,
        }

    async def _write_audit(
        self,
        db: AsyncSession,
        *,
        event: LiveEvent,
        status: ResolutionAuditStatus,
        attempt: int,
        close_price: float | None = None,
        winning_outcome: str | None = None,
        settlements_count: int = 0,
        error_message: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> MarketResolutionAudit:
        row = MarketResolutionAudit(
            market_id=event.id,
            external_id=event.external_id,
            source=event.source.value if event.source else PROVIDER,
            stock_ticker=(event.stock_ticker or None),
            strike_price=float(event.strike_price) if event.strike_price is not None else None,
            close_price=close_price,
            expiration_type=(
                event.expiration_type.value
                if event.expiration_type is not None
                else None
            ),
            expiration_date=event.expiration_date,
            winning_outcome=winning_outcome,
            settlements_count=settlements_count,
            attempt=attempt,
            status=status,
            error_message=error_message,
            metadata_json=metadata,
        )
        db.add(row)
        await db.flush()
        return row


async def run_sp500_market_resolution(
    *,
    settings: Settings | None = None,
    as_of: date | None = None,
) -> Sp500ResolutionResult:
    """One-shot EOD resolution with a fresh DB session."""
    cfg = settings or get_settings()
    service = Sp500ResolutionService(settings=cfg)
    try:
        from app.db.session import SessionLocal

        async with SessionLocal() as db:
            return await service.resolve_due(db, as_of=as_of, broadcast=True)
    finally:
        await service.aclose()
