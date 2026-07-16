"""S&P 500 dynamic binary market generator (Alpaca IEX → LMSR).

Alpaca used for MVP. Will switch to Polygon for scale.

Daily background job that:
1. Loads the S&P 500 universe via the Alpaca client
2. Fetches current / previous-close prices (IEX free tier)
3. Generates 6–10 binary LMSR markets per ticker around spot
   (±1%, 2%, 3%, 5% strikes for 0DTE and weekly Friday close)
4. Persists LiveEvent rows with ``provider/source = sp500_dynamic``

Market ids are deterministic (``sp500-{TICKER}-{exp}-{YYYY-MM-DD}-{strike}``)
so re-runs are idempotent — existing LMSR + DB rows are left untouched.

Official market-data docs (until Polygon swap):
- https://alpaca.markets/docs/
- https://alpaca.markets/docs/api-references/market-data-api/
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Sequence
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.account import StockExpirationType
from app.models.live_event import LiveEventSource
from app.runtime.catalog import now_ms
from app.runtime.store import MarketRuntime, TradingStore, get_trading_store
from integrations.alpaca import AlpacaClient, AlpacaError, AlpacaRateLimitError
from integrations.alpaca.market_calendar import (
    is_trading_day,
    next_trading_day,
    next_weekly_expiration,
    session_phase,
    us_equity_today,
)
from tasks.providers.base import IngestedEventSnapshot

logger = logging.getLogger(__name__)

# US equity session calendar (NYSE). Used for 0DTE / weekly Friday close.
_ET = ZoneInfo("America/New_York")
_HOUR_MS = 3_600_000

PROVIDER = LiveEventSource.SP500_DYNAMIC.value

# Strike offsets around spot. Combined across 0DTE + weekly → 8 markets / ticker
# (within the requested 6–10 range).
# Alpaca used for MVP. Will switch to Polygon for scale.
_ZERO_DTE_OFFSETS: tuple[float, ...] = (0.01, 0.02, 0.03, -0.01)
_WEEKLY_OFFSETS: tuple[float, ...] = (0.01, 0.02, 0.05, -0.02)


@dataclass
class GeneratedMarketSpec:
    """Deterministic spec for one binary S&P 500 market."""

    market_id: str
    ticker: str
    question: str
    strike_price: float
    expiration_type: str
    expiration_date: date
    spot_price: float
    previous_close: float | None
    base_yes_price: float
    closes_at_ms: int


@dataclass
class Sp500GenerationResult:
    tickers_considered: int = 0
    tickers_priced: int = 0
    specs: int = 0
    lmsr_created: int = 0
    lmsr_skipped: int = 0
    events_created: int = 0
    events_updated: int = 0
    events_unchanged: int = 0
    errors: list[str] = field(default_factory=list)


def _us_equity_today(now: datetime | None = None) -> date:
    return us_equity_today(now)


def next_friday(on_or_after: date) -> date:
    """Return the next weekly expiration (Friday, rolled past holidays)."""
    return next_weekly_expiration(on_or_after)


def session_close_ms(expiration: date) -> int:
    """Unix ms for 16:00 America/New_York on ``expiration``."""
    close_local = datetime(
        expiration.year,
        expiration.month,
        expiration.day,
        16,
        0,
        0,
        tzinfo=_ET,
    )
    return int(close_local.timestamp() * 1000)


def round_strike(spot: float, offset_pct: float) -> float:
    """Round a dynamic strike near ``spot * (1 + offset)`` to a tradable increment."""
    raw = spot * (1.0 + offset_pct)
    if spot < 25:
        step = 0.25
    elif spot < 100:
        step = 0.50
    elif spot < 500:
        step = 1.0
    else:
        step = 5.0
    rounded = round(round(raw / step) * step, 2)
    # Avoid a strike that collapses to spot after rounding.
    if abs(rounded - spot) < step * 0.25:
        rounded = round(spot + (step if offset_pct >= 0 else -step), 2)
    return max(step, rounded)


def implied_yes_price(spot: float, strike: float) -> float:
    """Heuristic LMSR seed price from moneyness (not a calibrated vol model)."""
    if spot <= 0 or strike <= 0:
        return 0.5
    moneyness = (spot - strike) / spot
    # Soft saturating map → keep LMSR away from absorbing barriers.
    score = math.tanh(moneyness / 0.04)
    return min(0.85, max(0.15, 0.5 + 0.35 * score))


def format_strike_token(strike: float) -> str:
    """Stable, filesystem-safe strike token for market ids."""
    text = f"{strike:.2f}".rstrip("0").rstrip(".")
    return text.replace(".", "p")


def build_market_id(
    ticker: str,
    expiration_type: str,
    expiration_date: date,
    strike: float,
) -> str:
    return (
        f"sp500-{ticker.upper()}-{expiration_type}-"
        f"{expiration_date.isoformat()}-{format_strike_token(strike)}"
    )


def build_question(ticker: str, strike: float, expiration_type: str) -> str:
    strike_label = f"${strike:,.2f}".rstrip("0").rstrip(".")
    symbol = ticker.upper()
    if expiration_type == StockExpirationType.ZERO_DTE.value:
        return f"Will {symbol} close above {strike_label} today?"
    return f"Will {symbol} close above {strike_label} this Friday?"


def extract_prices(snapshot: dict[str, Any]) -> tuple[float | None, float | None]:
    """Return ``(current_or_last, previous_close)`` from an Alpaca snapshot."""
    current: float | None = None
    previous: float | None = None

    latest_trade = snapshot.get("latestTrade") or snapshot.get("latest_trade") or {}
    if latest_trade.get("p") is not None:
        current = float(latest_trade["p"])

    daily = snapshot.get("dailyBar") or snapshot.get("daily_bar") or {}
    if current is None and daily.get("c") is not None:
        current = float(daily["c"])

    minute = snapshot.get("minuteBar") or snapshot.get("minute_bar") or {}
    if current is None and minute.get("c") is not None:
        current = float(minute["c"])

    prev = snapshot.get("prevDailyBar") or snapshot.get("prev_daily_bar") or {}
    if prev.get("c") is not None:
        previous = float(prev["c"])

    if current is None and previous is not None:
        current = previous
        # Tag thin / after-hours / low-volume fallbacks for callers.
        snapshot["_thin_quote"] = True
        snapshot["_session_phase"] = session_phase()
    return current, previous


def build_market_specs_for_ticker(
    ticker: str,
    spot: float,
    previous_close: float | None,
    *,
    as_of: date | None = None,
) -> list[GeneratedMarketSpec]:
    """Build 6–10 binary market specs around ``spot`` for one ticker.

    Skips 0DTE on weekends / NYSE holidays. Weekly expirations roll past
    holiday Fridays. Low spots (< $1) are rejected as untradeable / halted.
    """
    today = as_of or _us_equity_today()
    if spot is None or spot < 1.0:
        return []

    friday = next_friday(today)
    specs: list[GeneratedMarketSpec] = []
    seen_ids: set[str] = set()

    plans: list[tuple[str, date, Sequence[float]]] = []
    # 0DTE only on a live cash session day.
    if is_trading_day(today):
        plans.append((StockExpirationType.ZERO_DTE.value, today, _ZERO_DTE_OFFSETS))
    else:
        # Weekend/holiday runs still seed the next session's 0DTE book.
        plans.append(
            (
                StockExpirationType.ZERO_DTE.value,
                next_trading_day(today),
                _ZERO_DTE_OFFSETS,
            )
        )
    plans.append((StockExpirationType.WEEKLY.value, friday, _WEEKLY_OFFSETS))

    for expiration_type, expiration_date, offsets in plans:
        for offset in offsets:
            strike = round_strike(spot, offset)
            market_id = build_market_id(ticker, expiration_type, expiration_date, strike)
            if market_id in seen_ids:
                continue
            seen_ids.add(market_id)
            specs.append(
                GeneratedMarketSpec(
                    market_id=market_id,
                    ticker=ticker.upper(),
                    question=build_question(ticker, strike, expiration_type),
                    strike_price=strike,
                    expiration_type=expiration_type,
                    expiration_date=expiration_date,
                    spot_price=spot,
                    previous_close=previous_close,
                    base_yes_price=implied_yes_price(spot, strike),
                    closes_at_ms=session_close_ms(expiration_date),
                )
            )

    # Keep within the advertised 6–10 band if rounding collapsed ids.
    if len(specs) > 10:
        specs = specs[:10]
    return specs


class Sp500MarketGenerator:
    """Generate and upsert S&P 500 dynamic LMSR markets.

    Alpaca used for MVP. Will switch to Polygon for scale.
    """

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

    async def generate(
        self,
        *,
        db: AsyncSession | None = None,
        tickers: Sequence[str] | None = None,
        as_of: date | None = None,
        persist_events: bool = True,
    ) -> Sp500GenerationResult:
        """Run one generation cycle (idempotent).

        When ``db`` is provided, LiveEvent rows are upserted with
        ``source=sp500_dynamic``. LMSR markets are always written to the
        in-memory trading store.
        """
        result = Sp500GenerationResult()
        try:
            client = await self._get_client()
        except AlpacaError as exc:
            result.errors.append(str(exc))
            logger.error("S&P 500 generator: Alpaca client unavailable: %s", exc)
            return result

        universe = list(tickers) if tickers is not None else client.get_sp500_tickers()
        limit = self._settings.sp500_generator_ticker_limit
        if limit is not None and limit > 0:
            universe = universe[: int(limit)]
        result.tickers_considered = len(universe)

        if not universe:
            return result

        try:
            snapshots = await client.get_snapshots_all(universe)
        except AlpacaRateLimitError as exc:
            # Partial success path — continue with whatever we have (may be empty).
            result.errors.append(f"snapshots rate-limited: {exc}")
            logger.warning("S&P 500 generator: rate limited fetching snapshots: %s", exc)
            snapshots = {}
        except AlpacaError as exc:
            result.errors.append(f"snapshots: {exc}")
            logger.exception("S&P 500 generator: snapshot fetch failed")
            return result

        live_service = None
        if persist_events and db is not None:
            from services.live_event_service import get_live_event_service

            live_service = get_live_event_service(db)

        for ticker in universe:
            symbol = ticker.upper()
            snapshot = snapshots.get(symbol) or {}
            spot, previous = extract_prices(snapshot)
            if spot is None:
                # Fallback to latest trade endpoint when snapshot is thin (off-hours).
                try:
                    spot = await client.get_current_price(symbol)
                except AlpacaRateLimitError as exc:
                    result.errors.append(f"{symbol}: rate-limited ({exc})")
                    continue
                except AlpacaError as exc:
                    result.errors.append(f"{symbol}: {exc}")
                    continue
            if spot < 1.0:
                # Halted / penny / delisted — skip rather than seed nonsense strikes.
                result.errors.append(f"{symbol}: skipped low-price spot={spot}")
                continue
            result.tickers_priced += 1

            specs = build_market_specs_for_ticker(
                symbol,
                spot,
                previous,
                as_of=as_of,
            )
            result.specs += len(specs)

            for spec in specs:
                _, created = self._ensure_lmsr_market(spec)
                if created:
                    result.lmsr_created += 1
                else:
                    result.lmsr_skipped += 1

                if live_service is None:
                    continue
                try:
                    ingest = await live_service.ingest_snapshot(
                        self._to_snapshot(spec),
                        broadcast=True,
                    )
                    if ingest.created:
                        result.events_created += 1
                    elif ingest.changed:
                        result.events_updated += 1
                    else:
                        result.events_unchanged += 1
                except Exception as exc:  # noqa: BLE001
                    result.errors.append(f"{spec.market_id}: {exc}")
                    logger.exception(
                        "S&P 500 generator: failed to persist %s", spec.market_id
                    )

        logger.info(
            "S&P 500 generator finished: priced=%s specs=%s lmsr_created=%s "
            "events_created=%s errors=%s",
            result.tickers_priced,
            result.specs,
            result.lmsr_created,
            result.events_created,
            len(result.errors),
        )
        return result

    def _ensure_lmsr_market(self, spec: GeneratedMarketSpec) -> tuple[MarketRuntime, bool]:
        return self._store.create_market(
            market_id=spec.market_id,
            question=spec.question,
            category="stocks",
            base_price=spec.base_yes_price,
            closes_at=spec.closes_at_ms,
            volume_scale=0.35,
            source=PROVIDER,
            stock_ticker=spec.ticker,
            strike_price=spec.strike_price,
            expiration_type=spec.expiration_type,
            expiration_date=spec.expiration_date.isoformat(),
            liquidity=350.0,
        )

    @staticmethod
    def _to_snapshot(spec: GeneratedMarketSpec) -> IngestedEventSnapshot:
        remaining = spec.closes_at_ms - now_ms()
        status = "open"
        if remaining <= 0:
            status = "resolved"
        elif remaining < 6 * _HOUR_MS:
            status = "closing_soon"

        return IngestedEventSnapshot(
            external_id=spec.market_id,
            source=PROVIDER,
            category="stocks",
            question=spec.question,
            probabilities={
                "yes": spec.base_yes_price,
                "no": 1.0 - spec.base_yes_price,
            },
            status=status,
            volume=0.0,
            volume_24h=0.0,
            change_24h=0.0,
            provider=PROVIDER,
            metadata={
                "stock_ticker": spec.ticker,
                "strike_price": spec.strike_price,
                "expiration_type": spec.expiration_type,
                "expiration_date": spec.expiration_date.isoformat(),
                "spot_price": spec.spot_price,
                "previous_close": spec.previous_close,
            },
        )


async def run_sp500_market_generation(
    *,
    settings: Settings | None = None,
    tickers: Sequence[str] | None = None,
) -> Sp500GenerationResult:
    """One-shot generation with a fresh DB session (for the daily task)."""
    cfg = settings or get_settings()
    generator = Sp500MarketGenerator(settings=cfg)
    try:
        from app.db.session import SessionLocal

        async with SessionLocal() as db:
            return await generator.generate(db=db, tickers=tickers, persist_events=True)
    finally:
        await generator.aclose()
