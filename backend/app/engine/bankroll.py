"""Virtual bankroll: cash ledger, positions, and P&L tracking.

One ``VirtualBankroll`` represents a trader's funded (virtual) account
inside a challenge. It is the single source of truth for:

- **Cash** — every movement is an immutable ``LedgerEntry`` (audit trail).
- **Positions** — average-cost inventory per (market, outcome).
- **P&L** — realized on sells/settlement, unrealized via mark-to-market.

The bankroll enforces *solvency* rules only (no negative cash, no selling
shares you don't hold). Challenge/risk rules — drawdown, stake limits —
live in :mod:`app.engine.risk` and are checked before trades reach here.

Thread-safe: all mutations and reads take an internal ``RLock``.
"""

from __future__ import annotations

import enum
import threading
import time
import uuid

from pydantic import BaseModel, Field


def _now_ms() -> int:
    return int(time.time() * 1000)


class LedgerEntryType(str, enum.Enum):
    DEPOSIT = "deposit"
    BUY = "buy"
    SELL = "sell"
    SETTLEMENT = "settlement"
    FEE = "fee"
    ADJUSTMENT = "adjustment"


class LedgerEntry(BaseModel):
    """One immutable cash movement. ``amount`` is signed (+credit/−debit)."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: LedgerEntryType
    amount: float
    balance_after: float
    market_id: str | None = None
    outcome: int | None = None
    shares: float | None = None
    note: str = ""
    ts_ms: int = Field(default_factory=_now_ms)


class PositionState(BaseModel):
    """Average-cost inventory for one (market, outcome) leg."""

    market_id: str
    outcome: int
    shares: float
    avg_price: float
    realized_pnl: float = 0.0

    @property
    def cost_basis(self) -> float:
        return self.shares * self.avg_price


class BankrollSnapshot(BaseModel):
    """Point-in-time account valuation (drives risk checks and the UI)."""

    cash: float
    positions_value: float
    equity: float
    realized_pnl: float
    unrealized_pnl: float
    total_pnl: float
    ts_ms: int = Field(default_factory=_now_ms)


class InsufficientFunds(Exception):
    """Buy rejected: cost exceeds available cash."""


class InsufficientShares(Exception):
    """Sell rejected: trader holds fewer shares than offered."""


class VirtualBankroll:
    """A trader's virtual account: cash, positions, and P&L.

    Typical flow, composed with the LMSR engine::

        bankroll = VirtualBankroll(starting_balance=25_000)
        fill = market_maker.execute_buy(outcome=0, shares=100)
        bankroll.apply_buy("mkt-1", fill)
        ...
        snapshot = bankroll.mark_to_market({"mkt-1": market_maker.prices()})
    """

    def __init__(self, starting_balance: float, *, record_deposit: bool = True) -> None:
        if starting_balance <= 0:
            raise ValueError("starting_balance must be positive")
        self._starting_balance = starting_balance
        self._cash = 0.0
        self._positions: dict[tuple[str, int], PositionState] = {}
        self._ledger: list[LedgerEntry] = []
        self._realized_pnl = 0.0
        self._lock = threading.RLock()

        if record_deposit:
            self._credit(LedgerEntryType.DEPOSIT, starting_balance, note="Initial funding")
        else:
            self._cash = starting_balance

    # -- reads ---------------------------------------------------------

    @property
    def starting_balance(self) -> float:
        return self._starting_balance

    @property
    def cash(self) -> float:
        with self._lock:
            return self._cash

    def position(self, market_id: str, outcome: int) -> PositionState | None:
        with self._lock:
            pos = self._positions.get((market_id, outcome))
            return pos.model_copy() if pos else None

    def positions(self) -> list[PositionState]:
        with self._lock:
            return [p.model_copy() for p in self._positions.values() if p.shares > 0]

    def ledger(self, limit: int | None = None) -> list[LedgerEntry]:
        with self._lock:
            entries = list(self._ledger)
        return entries[-limit:] if limit else entries

    def market_exposure(self, market_id: str) -> float:
        """Total cost basis currently at risk in one market."""
        with self._lock:
            return sum(
                p.cost_basis for (mid, _), p in self._positions.items() if mid == market_id
            )

    def total_exposure(self) -> float:
        with self._lock:
            return sum(p.cost_basis for p in self._positions.values())

    # -- trading -------------------------------------------------------

    def apply_buy(
        self, market_id: str, *, outcome: int, shares: float, gross_value: float, fee: float = 0.0
    ) -> LedgerEntry:
        """Books a buy fill: debits cash, grows the position at average cost.

        Raises :class:`InsufficientFunds` if ``gross_value + fee`` exceeds
        cash — the bankroll never goes negative.
        """
        total = gross_value + fee
        with self._lock:
            if total > self._cash + 1e-9:
                raise InsufficientFunds(
                    f"Buy costs {total:.2f} but only {self._cash:.2f} cash is available"
                )
            key = (market_id, outcome)
            pos = self._positions.get(key)
            if pos is None:
                self._positions[key] = PositionState(
                    market_id=market_id,
                    outcome=outcome,
                    shares=shares,
                    avg_price=gross_value / shares,
                )
            else:
                new_shares = pos.shares + shares
                pos.avg_price = (pos.cost_basis + gross_value) / new_shares
                pos.shares = new_shares
            entry = self._debit(
                LedgerEntryType.BUY,
                total,
                market_id=market_id,
                outcome=outcome,
                shares=shares,
                note=f"Buy {shares:g} @ {gross_value / shares:.4f} (fee {fee:.2f})",
            )
        return entry

    def apply_sell(
        self, market_id: str, *, outcome: int, shares: float, gross_value: float, fee: float = 0.0
    ) -> LedgerEntry:
        """Books a sell fill: credits cash, realizes P&L against avg cost.

        Raises :class:`InsufficientShares` when selling more than held.
        """
        with self._lock:
            key = (market_id, outcome)
            pos = self._positions.get(key)
            if pos is None or pos.shares + 1e-9 < shares:
                held = pos.shares if pos else 0.0
                raise InsufficientShares(f"Selling {shares:g} but holding {held:g}")

            proceeds = gross_value - fee
            realized = gross_value - pos.avg_price * shares - fee
            pos.shares -= shares
            pos.realized_pnl += realized
            self._realized_pnl += realized
            if pos.shares <= 1e-9:
                del self._positions[key]

            entry = self._credit(
                LedgerEntryType.SELL,
                proceeds,
                market_id=market_id,
                outcome=outcome,
                shares=shares,
                note=f"Sell {shares:g} @ {gross_value / shares:.4f} (fee {fee:.2f})",
            )
        return entry

    def settle_market(self, market_id: str, winning_outcome: int) -> list[LedgerEntry]:
        """Resolves a market: winning shares pay $1, losing shares pay $0.

        Every open leg in the market is closed and its P&L realized.
        """
        entries: list[LedgerEntry] = []
        with self._lock:
            keys = [k for k in self._positions if k[0] == market_id]
            for key in keys:
                pos = self._positions.pop(key)
                payout = pos.shares if pos.outcome == winning_outcome else 0.0
                realized = payout - pos.cost_basis
                self._realized_pnl += realized
                entries.append(
                    self._credit(
                        LedgerEntryType.SETTLEMENT,
                        payout,
                        market_id=market_id,
                        outcome=pos.outcome,
                        shares=pos.shares,
                        note=(
                            f"Settled {'WIN' if payout else 'LOSS'} "
                            f"({pos.shares:g} shares, realized {realized:+.2f})"
                        ),
                    )
                )
        return entries

    # -- valuation -----------------------------------------------------

    def mark_to_market(self, prices: dict[str, list[float]]) -> BankrollSnapshot:
        """Values the account against current market prices.

        Args:
            prices: ``{market_id: [price per outcome]}`` — typically each
                market maker's :meth:`~app.engine.lmsr.LMSRMarketMaker.prices`.

        Positions in markets missing from ``prices`` are valued at cost.
        """
        with self._lock:
            value = 0.0
            unrealized = 0.0
            for (market_id, outcome), pos in self._positions.items():
                market_prices = prices.get(market_id)
                mark = (
                    market_prices[outcome]
                    if market_prices and outcome < len(market_prices)
                    else pos.avg_price
                )
                leg_value = pos.shares * mark
                value += leg_value
                unrealized += leg_value - pos.cost_basis
            return BankrollSnapshot(
                cash=self._cash,
                positions_value=value,
                equity=self._cash + value,
                realized_pnl=self._realized_pnl,
                unrealized_pnl=unrealized,
                total_pnl=self._cash + value - self._starting_balance,
            )

    # -- internals -----------------------------------------------------

    def _credit(self, type_: LedgerEntryType, amount: float, **fields) -> LedgerEntry:
        self._cash += amount
        entry = LedgerEntry(type=type_, amount=amount, balance_after=self._cash, **fields)
        self._ledger.append(entry)
        return entry

    def _debit(self, type_: LedgerEntryType, amount: float, **fields) -> LedgerEntry:
        self._cash -= amount
        entry = LedgerEntry(type=type_, amount=-amount, balance_after=self._cash, **fields)
        self._ledger.append(entry)
        return entry
