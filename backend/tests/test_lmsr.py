import math
import threading

import pytest

from app.engine.lmsr import LMSRConfig, LMSRMarketMaker


def make_mm(**overrides) -> LMSRMarketMaker:
    return LMSRMarketMaker(LMSRConfig(**{"num_outcomes": 2, "liquidity": 100.0, **overrides}))


class TestPricing:
    def test_initial_prices_are_uniform(self):
        mm = LMSRMarketMaker(LMSRConfig(num_outcomes=4, liquidity=100))
        assert mm.prices() == pytest.approx([0.25] * 4)

    def test_prices_always_sum_to_one(self):
        mm = make_mm()
        mm.execute_buy(0, 250)
        mm.execute_sell(1, 80)
        assert math.fsum(mm.prices()) == pytest.approx(1.0)

    def test_buying_raises_price(self):
        mm = make_mm()
        before = mm.price(0)
        mm.execute_buy(0, 50)
        assert mm.price(0) > before

    def test_extreme_quantities_do_not_overflow(self):
        mm = LMSRMarketMaker(LMSRConfig(num_outcomes=2, liquidity=10), [1e6, -1e6])
        prices = mm.prices()
        assert prices[0] > 0.999
        assert math.fsum(prices) == pytest.approx(1.0)


class TestCosts:
    def test_buy_cost_matches_cost_function_delta(self):
        mm = make_mm()
        c0 = mm.cost()
        quote = mm.quote_buy(0, 30)
        mm.execute_buy(0, 30)
        assert quote.gross_value == pytest.approx(mm.cost() - c0)

    def test_round_trip_is_neutral_without_fees(self):
        mm = make_mm(fee_rate=0.0)
        buy = mm.execute_buy(0, 100)
        sell = mm.execute_sell(0, 100)
        assert sell.total == pytest.approx(buy.total)
        assert mm.prices() == pytest.approx([0.5, 0.5])

    def test_fees_are_charged_and_accumulated(self):
        mm = make_mm(fee_rate=0.02)
        fill = mm.execute_buy(0, 100)
        assert fill.fee == pytest.approx(fill.gross_value * 0.02)
        assert fill.total == pytest.approx(fill.gross_value + fill.fee)
        assert mm.state().fees_collected == pytest.approx(fill.fee)

    def test_worst_case_loss_bounded_by_subsidy(self):
        config = LMSRConfig(num_outcomes=2, liquidity=100)
        mm = LMSRMarketMaker(config)
        fill = mm.execute_buy(0, 10_000)  # drive price to ~1
        # If outcome 0 wins, the operator pays out shares minus what it collected.
        operator_loss = fill.shares - fill.gross_value
        assert operator_loss <= config.max_subsidy + 1e-6

    def test_shares_for_budget_inverts_quote(self):
        mm = make_mm()
        shares = mm.shares_for_budget(0, budget=25.0)
        quote = mm.quote_buy(0, shares)
        assert quote.gross_value == pytest.approx(25.0)


class TestValidation:
    def test_rejects_bad_outcome(self):
        with pytest.raises(ValueError):
            make_mm().quote_buy(5, 10)

    def test_rejects_non_positive_shares(self):
        mm = make_mm()
        with pytest.raises(ValueError):
            mm.quote_buy(0, 0)
        with pytest.raises(ValueError):
            mm.execute_sell(0, float("nan"))

    def test_state_round_trip(self):
        mm = make_mm(fee_rate=0.01)
        mm.execute_buy(1, 42)
        restored = LMSRMarketMaker.from_state(mm.state())
        assert restored.prices() == pytest.approx(mm.prices())
        assert restored.state() == mm.state()


class TestThreadSafety:
    def test_concurrent_buys_preserve_invariants(self):
        mm = make_mm(liquidity=500)
        errors: list[Exception] = []

        def buy():
            try:
                for _ in range(50):
                    mm.execute_buy(0, 1)
                    mm.execute_sell(0, 1)
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=buy) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors
        # Every buy was matched by a sell → back to the initial state.
        assert mm.prices() == pytest.approx([0.5, 0.5])
        assert mm.state().volume > 0
