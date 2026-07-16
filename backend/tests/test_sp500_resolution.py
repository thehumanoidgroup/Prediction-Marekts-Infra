"""Tests for automated S&P 500 dynamic market resolution."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select

from app.engine.bankroll import PositionState, VirtualBankroll
from app.engine.lmsr import LMSRConfig, LMSRMarketMaker
from app.engine.risk import RiskEngine, RiskLimits
from app.models.live_event import LiveEvent, LiveEventSource, LiveEventStatus
from app.models.resolution_audit import MarketResolutionAudit, ResolutionAuditStatus
from app.runtime.catalog import now_ms
from app.runtime.store import MarketRuntime, TraderSession, TradingStore
from services.sp500_market_generator import session_close_ms
from services.sp500_resolution_service import (
    Sp500ResolutionService,
    decide_outcome,
    extract_close,
)


def test_decide_outcome_above_strike_is_yes() -> None:
    assert decide_outcome(191.0, 190.0) == 0
    assert decide_outcome(190.0, 190.0) == 1
    assert decide_outcome(189.0, 190.0) == 1


def test_extract_close() -> None:
    assert extract_close([{"c": 188.5, "o": 180}]) == 188.5
    assert extract_close([]) is None


@pytest.mark.asyncio
async def test_resolve_one_settles_bankroll_and_audits(db_session) -> None:
    store = TradingStore()
    store._markets.clear()
    store._sessions.clear()

    market_id = "sp500-AAPL-0dte-2026-07-15-190"
    maker = LMSRMarketMaker(LMSRConfig(num_outcomes=2, liquidity=200, fee_rate=0.0))
    store._markets[market_id] = MarketRuntime(
        seed_id=market_id,
        question="Will AAPL close above $190 today?",
        category="stocks",
        maker=maker,
        closes_at=now_ms() - 60_000,
        source="sp500_dynamic",
        stock_ticker="AAPL",
        strike_price=190.0,
        expiration_type="0dte",
        expiration_date="2026-07-15",
    )

    bankroll = VirtualBankroll(starting_balance=10_000)
    with bankroll._lock:
        bankroll._positions[(market_id, 0)] = PositionState(
            market_id=market_id,
            outcome=0,
            shares=100,
            avg_price=0.5,
        )
        bankroll._cash -= 50.0

    session = TraderSession(
        tenant_slug="demo",
        user_id="user-1",
        bankroll=bankroll,
        risk=RiskEngine(
            RiskLimits(
                starting_balance=10_000,
                profit_target_pct=10,
                max_daily_loss_pct=5,
                max_drawdown_pct=10,
            )
        ),
        provider="sp500_dynamic",
    )
    store._sessions[("demo", "user-1")] = session
    cash_before = bankroll.cash

    event = LiveEvent(
        external_id=market_id,
        source=LiveEventSource.SP500_DYNAMIC,
        category="stocks",
        status=LiveEventStatus.OPEN,
        question="Will AAPL close above $190 today?",
        probabilities={"yes": 0.55, "no": 0.45},
        stock_ticker="AAPL",
        strike_price=190.0,
        expiration_date=date(2026, 7, 15),
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)

    client = MagicMock()
    client.get_daily_bars = AsyncMock(return_value=[{"c": 192.5}])
    client.aclose = AsyncMock()

    service = Sp500ResolutionService(client=client, store=store)
    detail = await service.resolve_one(db_session, event, broadcast=False)
    await db_session.commit()

    assert detail["status"] == "success"
    assert detail["winning_outcome"] == "yes"
    assert detail["settlements_count"] == 1
    assert event.status is LiveEventStatus.RESOLVED
    assert store.get_market(market_id).resolved_outcome == "yes"
    assert bankroll.cash == pytest.approx(cash_before + 100.0)

    audits = (await db_session.execute(select(MarketResolutionAudit))).scalars().all()
    assert any(a.status is ResolutionAuditStatus.SUCCESS for a in audits)


@pytest.mark.asyncio
async def test_resolve_one_is_idempotent(db_session) -> None:
    store = TradingStore()
    store._markets.clear()
    store._sessions.clear()

    market_id = "sp500-MSFT-weekly-2026-07-17-420"
    event = LiveEvent(
        external_id=market_id,
        source=LiveEventSource.SP500_DYNAMIC,
        category="stocks",
        status=LiveEventStatus.RESOLVED,
        question="Will MSFT close above $420 this Friday?",
        probabilities={"yes": 1.0, "no": 0.0},
        stock_ticker="MSFT",
        strike_price=420.0,
        expiration_date=date(2026, 7, 17),
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)

    client = MagicMock()
    client.get_daily_bars = AsyncMock(return_value=[{"c": 430.0}])
    service = Sp500ResolutionService(client=client, store=store)
    detail = await service.resolve_one(db_session, event, broadcast=False)
    await db_session.commit()
    assert detail["status"] == "skipped"
    client.get_daily_bars.assert_not_awaited()


@pytest.mark.asyncio
async def test_fetch_close_retries_then_succeeds() -> None:
    client = MagicMock()
    client.get_daily_bars = AsyncMock(side_effect=[Exception("timeout"), [{"c": 100.0}]])
    service = Sp500ResolutionService(client=client)
    service._settings = MagicMock(
        sp500_resolution_max_retries=3,
        sp500_resolution_retry_backoff_seconds=0.01,
    )
    close = await service.fetch_close_with_retries("AAPL", date(2026, 7, 15))
    assert close == 100.0
    assert client.get_daily_bars.await_count == 2


@pytest.mark.asyncio
async def test_list_markets_due_filters_by_session_close(db_session) -> None:
    past = date(2026, 7, 15)
    future = date(2099, 1, 2)
    due_event = LiveEvent(
        external_id="sp500-AAPL-0dte-2026-07-15-191p5",
        source=LiveEventSource.SP500_DYNAMIC,
        category="stocks",
        status=LiveEventStatus.OPEN,
        question="q1",
        probabilities={"yes": 0.5, "no": 0.5},
        stock_ticker="AAPL",
        strike_price=191.5,
        expiration_date=past,
    )
    future_event = LiveEvent(
        external_id="sp500-AAPL-0dte-2099-01-02-191p5",
        source=LiveEventSource.SP500_DYNAMIC,
        category="stocks",
        status=LiveEventStatus.OPEN,
        question="q2",
        probabilities={"yes": 0.5, "no": 0.5},
        stock_ticker="AAPL",
        strike_price=191.5,
        expiration_date=future,
    )
    db_session.add_all([due_event, future_event])
    await db_session.commit()

    service = Sp500ResolutionService(client=MagicMock())
    after_close = session_close_ms(past) + 60_000
    due = await service.list_markets_due(
        db_session,
        as_of=date(2026, 7, 16),
        now=after_close,
    )
    ids = {event.external_id for event in due}
    assert "sp500-AAPL-0dte-2026-07-15-191p5" in ids
    assert "sp500-AAPL-0dte-2099-01-02-191p5" not in ids
