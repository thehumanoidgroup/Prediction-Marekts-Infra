"""End-to-end engine composition: LMSR × bankroll × risk.

Mirrors exactly what the order-execution API route will do.
"""

import pytest

from app.engine.bankroll import VirtualBankroll
from app.engine.lmsr import LMSRConfig, LMSRMarketMaker
from app.engine.risk import ChallengeStatus, DrawdownMode, OrderIntent, RiskEngine, RiskLimits


def trade_flow(mm, bankroll, engine, market_id, outcome, shares):
    """The canonical order pipeline: risk check → fill → book → re-mark."""
    quote = mm.quote_buy(outcome, shares)
    decision = engine.check_order(
        OrderIntent(
            market_id=market_id,
            stake=quote.total,
            current_market_exposure=bankroll.market_exposure(market_id),
            current_total_exposure=bankroll.total_exposure(),
        )
    )
    if not decision.allowed:
        return decision, None
    fill = mm.execute_buy(outcome, shares)
    bankroll.apply_buy(
        market_id, outcome=outcome, shares=shares, gross_value=fill.gross_value, fee=fill.fee
    )
    snapshot = bankroll.mark_to_market({market_id: mm.prices()})
    engine.on_equity(snapshot.equity, traded=True)
    return decision, fill


def test_full_trade_lifecycle():
    mm = LMSRMarketMaker(LMSRConfig(num_outcomes=2, liquidity=500, fee_rate=0.01))
    bankroll = VirtualBankroll(starting_balance=25_000)
    engine = RiskEngine(
        RiskLimits(
            starting_balance=25_000,
            profit_target_pct=10,
            max_daily_loss_pct=5,
            drawdown_mode=DrawdownMode.TRAILING,
            max_drawdown_pct=10,
            max_stake_per_order=5_000,
            max_exposure_per_market=8_000,
        )
    )

    decision, fill = trade_flow(mm, bankroll, engine, "mkt-btc", outcome=0, shares=1_000)
    assert decision.allowed and fill is not None
    assert engine.status is ChallengeStatus.ACTIVE
    assert bankroll.cash == pytest.approx(25_000 - fill.total)

    # A pick that busts the per-market cap is rejected before touching state.
    cash_before = bankroll.cash
    decision, fill = trade_flow(mm, bankroll, engine, "mkt-btc", outcome=0, shares=20_000)
    assert not decision.allowed and fill is None
    assert bankroll.cash == cash_before

    # Settlement realizes P&L and the risk engine sees the new equity.
    bankroll.settle_market("mkt-btc", winning_outcome=0)
    snapshot = bankroll.mark_to_market({})
    events = engine.on_equity(snapshot.equity)
    assert snapshot.realized_pnl > 0  # bought below $1, paid out at $1
    assert engine.status in (ChallengeStatus.ACTIVE, ChallengeStatus.PASSED)
    assert isinstance(events, list)
