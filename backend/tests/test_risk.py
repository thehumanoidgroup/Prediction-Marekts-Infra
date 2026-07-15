import pytest

from app.engine.risk import (
    BreachType,
    ChallengeStatus,
    DrawdownMode,
    OrderIntent,
    RiskEngine,
    RiskLimits,
)


def limits(**overrides) -> RiskLimits:
    return RiskLimits(
        **{
            "starting_balance": 10_000,
            "profit_target_pct": 10,
            "max_daily_loss_pct": 5,
            "drawdown_mode": DrawdownMode.STATIC,
            "max_drawdown_pct": 10,
            **overrides,
        }
    )


class TestOrderChecks:
    def test_order_within_limits_allowed(self):
        engine = RiskEngine(limits(max_stake_per_order=500))
        decision = engine.check_order(OrderIntent(market_id="m1", stake=300))
        assert decision.allowed and not decision.violations

    def test_per_pick_stake_limit(self):
        engine = RiskEngine(limits(max_stake_per_order=500))
        decision = engine.check_order(OrderIntent(market_id="m1", stake=501))
        assert not decision.allowed
        assert decision.violations == [BreachType.STAKE_PER_ORDER]

    def test_per_market_exposure_limit(self):
        engine = RiskEngine(limits(max_exposure_per_market=1_000))
        decision = engine.check_order(
            OrderIntent(market_id="m1", stake=400, current_market_exposure=700)
        )
        assert not decision.allowed
        assert BreachType.MARKET_EXPOSURE in decision.violations

    def test_total_exposure_limit_stacks_with_others(self):
        engine = RiskEngine(limits(max_stake_per_order=300, max_total_exposure=2_000))
        decision = engine.check_order(
            OrderIntent(market_id="m1", stake=400, current_total_exposure=1_900)
        )
        assert set(decision.violations) == {BreachType.STAKE_PER_ORDER, BreachType.TOTAL_EXPOSURE}

    def test_orders_rejected_after_failure(self):
        engine = RiskEngine(limits())
        engine.on_equity(8_500)  # below static floor 9,000
        decision = engine.check_order(OrderIntent(market_id="m1", stake=10))
        assert not decision.allowed
        assert "failed" in decision.reasons[0]


class TestDrawdownModes:
    def test_static_floor_fixed(self):
        engine = RiskEngine(limits(drawdown_mode=DrawdownMode.STATIC, max_drawdown_pct=10))
        assert engine.drawdown_floor() == pytest.approx(9_000)
        engine.on_equity(12_000)  # new HWM must not move a static floor
        assert engine.drawdown_floor() == pytest.approx(9_000)

    def test_trailing_floor_follows_hwm_and_locks_at_start(self):
        # profit_target_pct=50 keeps the challenge ACTIVE while equity climbs.
        engine = RiskEngine(
            limits(drawdown_mode=DrawdownMode.TRAILING, max_drawdown_pct=5, profit_target_pct=50)
        )
        assert engine.drawdown_floor() == pytest.approx(9_500)
        engine.on_equity(10_300)
        assert engine.drawdown_floor() == pytest.approx(9_800)
        engine.on_equity(11_000)  # floor would be 10,500 but locks at start
        assert engine.drawdown_floor() == pytest.approx(10_000)
        assert engine.status is ChallengeStatus.ACTIVE

    def test_trailing_without_lock(self):
        engine = RiskEngine(
            limits(
                drawdown_mode=DrawdownMode.TRAILING,
                max_drawdown_pct=5,
                trailing_locks_at_start=False,
                profit_target_pct=50,
            )
        )
        engine.on_equity(11_000)
        assert engine.drawdown_floor() == pytest.approx(10_500)

    def test_absolute_floor(self):
        engine = RiskEngine(
            limits(drawdown_mode=DrawdownMode.ABSOLUTE, absolute_floor=9_200)
        )
        assert engine.drawdown_floor() == pytest.approx(9_200)
        events = engine.on_equity(9_100)
        assert engine.status is ChallengeStatus.FAILED
        assert events[0].type is BreachType.MAX_DRAWDOWN

    def test_absolute_mode_requires_floor(self):
        with pytest.raises(ValueError):
            limits(drawdown_mode=DrawdownMode.ABSOLUTE)


class TestRealTimeEnforcement:
    def test_drawdown_breach_fails_once(self):
        engine = RiskEngine(limits())
        first = engine.on_equity(8_900)
        again = engine.on_equity(8_800)
        assert first[0].type is BreachType.MAX_DRAWDOWN
        assert again == []  # already failed; no duplicate events

    def test_daily_loss_breach(self):
        engine = RiskEngine(limits(max_daily_loss_pct=3))
        engine.start_trading_day(10_000)
        events = engine.on_equity(9_690)  # -310 on a 300 limit
        assert engine.status is ChallengeStatus.FAILED
        assert events[0].type is BreachType.DAILY_LOSS

    def test_daily_anchor_resets_each_day(self):
        engine = RiskEngine(limits(max_daily_loss_pct=3))
        engine.on_equity(9_750, traded=True)  # -250, within the 300 limit
        engine.start_trading_day()  # new day anchored at 9,750
        events = engine.on_equity(9_500)  # -250 from today's open → fine
        assert events == []
        assert engine.status is ChallengeStatus.ACTIVE

    def test_profit_target_passes_challenge(self):
        engine = RiskEngine(limits(profit_target_pct=10, min_trading_days=0))
        events = engine.on_equity(11_050, traded=True)
        assert engine.status is ChallengeStatus.PASSED
        assert events[0].status is ChallengeStatus.PASSED

    def test_profit_target_gated_by_min_trading_days(self):
        engine = RiskEngine(limits(profit_target_pct=10, min_trading_days=5))
        engine.on_equity(11_200, traded=True)
        assert engine.status is ChallengeStatus.ACTIVE  # not enough days yet

    def test_progress_snapshot(self):
        engine = RiskEngine(limits())
        engine.on_equity(9_800, traded=True)
        progress = engine.progress()
        assert progress.daily_loss_used == pytest.approx(200)
        assert progress.profit_target == pytest.approx(11_000)
        assert progress.trading_days == 1
