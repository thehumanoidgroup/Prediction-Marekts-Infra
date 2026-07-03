import pytest

from app.engine.bankroll import (
    InsufficientFunds,
    InsufficientShares,
    LedgerEntryType,
    VirtualBankroll,
)


@pytest.fixture
def bankroll() -> VirtualBankroll:
    return VirtualBankroll(starting_balance=10_000)


class TestCashAndLedger:
    def test_initial_deposit_recorded(self, bankroll: VirtualBankroll):
        assert bankroll.cash == 10_000
        (entry,) = bankroll.ledger()
        assert entry.type is LedgerEntryType.DEPOSIT
        assert entry.balance_after == 10_000

    def test_buy_debits_cash_including_fee(self, bankroll: VirtualBankroll):
        bankroll.apply_buy("mkt-1", outcome=0, shares=100, gross_value=60, fee=1.2)
        assert bankroll.cash == pytest.approx(10_000 - 61.2)

    def test_buy_rejected_when_insolvent(self, bankroll: VirtualBankroll):
        with pytest.raises(InsufficientFunds):
            bankroll.apply_buy("mkt-1", outcome=0, shares=1, gross_value=10_001, fee=0)
        assert bankroll.cash == 10_000  # unchanged

    def test_sell_more_than_held_rejected(self, bankroll: VirtualBankroll):
        bankroll.apply_buy("mkt-1", outcome=0, shares=10, gross_value=6)
        with pytest.raises(InsufficientShares):
            bankroll.apply_sell("mkt-1", outcome=0, shares=11, gross_value=7)


class TestPositionsAndPnl:
    def test_average_cost_accumulates(self, bankroll: VirtualBankroll):
        bankroll.apply_buy("mkt-1", outcome=0, shares=100, gross_value=40)  # 0.40
        bankroll.apply_buy("mkt-1", outcome=0, shares=100, gross_value=60)  # 0.60
        pos = bankroll.position("mkt-1", 0)
        assert pos is not None
        assert pos.shares == 200
        assert pos.avg_price == pytest.approx(0.50)

    def test_sell_realizes_pnl_against_avg_cost(self, bankroll: VirtualBankroll):
        bankroll.apply_buy("mkt-1", outcome=0, shares=100, gross_value=50)  # 0.50
        bankroll.apply_sell("mkt-1", outcome=0, shares=60, gross_value=42)  # 0.70
        snapshot = bankroll.mark_to_market({})
        assert snapshot.realized_pnl == pytest.approx(60 * 0.20)
        pos = bankroll.position("mkt-1", 0)
        assert pos is not None and pos.shares == 40

    def test_settlement_pays_winners_and_zeroes_losers(self, bankroll: VirtualBankroll):
        bankroll.apply_buy("mkt-1", outcome=0, shares=100, gross_value=60)  # YES
        bankroll.apply_buy("mkt-1", outcome=1, shares=50, gross_value=20)  # NO
        cash_before = bankroll.cash
        bankroll.settle_market("mkt-1", winning_outcome=0)
        assert bankroll.cash == pytest.approx(cash_before + 100)  # $1/share
        assert bankroll.positions() == []
        snapshot = bankroll.mark_to_market({})
        assert snapshot.realized_pnl == pytest.approx((100 - 60) + (0 - 20))

    def test_mark_to_market_equity(self, bankroll: VirtualBankroll):
        bankroll.apply_buy("mkt-1", outcome=0, shares=100, gross_value=50)  # 0.50
        snapshot = bankroll.mark_to_market({"mkt-1": [0.65, 0.35]})
        assert snapshot.positions_value == pytest.approx(65)
        assert snapshot.unrealized_pnl == pytest.approx(15)
        assert snapshot.equity == pytest.approx(bankroll.cash + 65)
        assert snapshot.total_pnl == pytest.approx(snapshot.equity - 10_000)

    def test_exposure_tracking(self, bankroll: VirtualBankroll):
        bankroll.apply_buy("mkt-1", outcome=0, shares=100, gross_value=50)
        bankroll.apply_buy("mkt-2", outcome=1, shares=100, gross_value=30)
        assert bankroll.market_exposure("mkt-1") == pytest.approx(50)
        assert bankroll.total_exposure() == pytest.approx(80)
