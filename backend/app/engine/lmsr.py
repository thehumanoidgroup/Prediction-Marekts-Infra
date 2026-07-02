"""Logarithmic Market Scoring Rule (LMSR) automated market maker.

The LMSR (Hanson, 2003) quotes prices for N mutually exclusive outcomes
from a cost function::

    C(q) = b * ln( Σ_j exp(q_j / b) )

where ``q_j`` is the net quantity of outcome-j shares sold by the market
maker and ``b`` is the liquidity parameter. The price of outcome ``i`` is
the softmax ``exp(q_i / b) / Σ_j exp(q_j / b)``, so prices always sum to 1
and can be read directly as probabilities. A trade of ``δ`` shares costs
``C(q + δ·e_i) − C(q)``. The market maker's worst-case loss (its subsidy)
is bounded by ``b · ln(N)``.

Implementation notes:

- All math routes through a numerically stable log-sum-exp, so extreme
  quantities cannot overflow ``exp``.
- Instances are thread-safe: quotes are pure reads of an immutable
  snapshot, and executions swap state atomically under an ``RLock``.
- Fees accrue to the market maker and are reported separately on every
  quote and fill so the ledger can book them explicitly.
"""

from __future__ import annotations

import math
import threading
import time

from pydantic import BaseModel, Field, model_validator

# Prices are clamped away from exactly 0/1 when reported, mirroring how
# venues avoid quoting certainties before resolution.
_PRICE_EPSILON = 1e-9


def _logsumexp(values: list[float]) -> float:
    """Numerically stable ``ln(Σ exp(v))``."""
    peak = max(values)
    return peak + math.log(math.fsum(math.exp(v - peak) for v in values))


def _softmax(values: list[float]) -> list[float]:
    peak = max(values)
    exps = [math.exp(v - peak) for v in values]
    total = math.fsum(exps)
    return [e / total for e in exps]


class LMSRConfig(BaseModel):
    """Immutable parameters of one LMSR market.

    Attributes:
        num_outcomes: Number of mutually exclusive outcomes (2 = binary).
        liquidity: The ``b`` parameter. Higher = deeper book: prices move
            less per share, but the operator's max subsidy ``b·ln(N)`` grows.
        fee_rate: Proportional fee on gross trade value, e.g. 0.02 = 2%.
            Charged on top of buys and deducted from sell proceeds.
    """

    model_config = {"frozen": True}

    num_outcomes: int = Field(default=2, ge=2, le=64)
    liquidity: float = Field(default=250.0, gt=0)
    fee_rate: float = Field(default=0.0, ge=0, lt=0.2)

    @property
    def max_subsidy(self) -> float:
        """Worst-case loss the operator can incur on this market."""
        return self.liquidity * math.log(self.num_outcomes)


class Quote(BaseModel):
    """A firm price for buying or selling shares against the pool.

    ``total`` is what the trader's bankroll pays (buy) or receives (sell),
    fee included. Quotes are computed against a snapshot and validated
    again atomically at execution time.
    """

    side: str  # "buy" | "sell"
    outcome: int
    shares: float
    gross_value: float
    fee: float
    total: float
    avg_price: float
    price_before: float
    price_after: float


class Fill(BaseModel):
    """The result of an executed trade, ready to book into a ledger."""

    side: str
    outcome: int
    shares: float
    gross_value: float
    fee: float
    total: float
    avg_price: float
    prices: list[float]
    filled_at_ms: int


class MarketMakerState(BaseModel):
    """Serializable snapshot of a market maker (persist/restore)."""

    config: LMSRConfig
    quantities: list[float]
    fees_collected: float
    volume: float

    @model_validator(mode="after")
    def _shapes_match(self) -> "MarketMakerState":
        if len(self.quantities) != self.config.num_outcomes:
            raise ValueError("quantities length must equal num_outcomes")
        return self


class LMSRMarketMaker:
    """Thread-safe LMSR market maker for one market.

    Typical flow::

        mm = LMSRMarketMaker(LMSRConfig(num_outcomes=2, liquidity=300))
        quote = mm.quote_buy(outcome=0, shares=100)   # inspect cost
        fill = mm.execute_buy(outcome=0, shares=100)  # trade at current state
        mm.prices()                                   # updated probabilities

    The engine deliberately allows negative inventory (traders shorting
    via sells they don't hold is prevented one layer up, by the bankroll).
    """

    def __init__(self, config: LMSRConfig, quantities: list[float] | None = None) -> None:
        self._config = config
        self._q = list(quantities) if quantities is not None else [0.0] * config.num_outcomes
        if len(self._q) != config.num_outcomes:
            raise ValueError("quantities length must equal num_outcomes")
        self._fees_collected = 0.0
        self._volume = 0.0
        self._lock = threading.RLock()

    # -- reads ---------------------------------------------------------

    @property
    def config(self) -> LMSRConfig:
        return self._config

    def prices(self) -> list[float]:
        """Current outcome probabilities (sum to 1)."""
        with self._lock:
            scaled = [q / self._config.liquidity for q in self._q]
        return [min(1 - _PRICE_EPSILON, max(_PRICE_EPSILON, p)) for p in _softmax(scaled)]

    def price(self, outcome: int) -> float:
        return self.prices()[self._check_outcome(outcome)]

    def cost(self) -> float:
        """Current value of the cost function ``C(q)``."""
        with self._lock:
            return self._cost(self._q)

    def state(self) -> MarketMakerState:
        with self._lock:
            return MarketMakerState(
                config=self._config,
                quantities=list(self._q),
                fees_collected=self._fees_collected,
                volume=self._volume,
            )

    @classmethod
    def from_state(cls, state: MarketMakerState) -> "LMSRMarketMaker":
        mm = cls(state.config, state.quantities)
        mm._fees_collected = state.fees_collected
        mm._volume = state.volume
        return mm

    # -- quoting -------------------------------------------------------

    def quote_buy(self, outcome: int, shares: float) -> Quote:
        """Cost to buy ``shares`` of ``outcome`` at the current state."""
        self._check_outcome(outcome)
        self._check_shares(shares)
        with self._lock:
            return self._quote(outcome, shares, side="buy")

    def quote_sell(self, outcome: int, shares: float) -> Quote:
        """Proceeds from selling ``shares`` of ``outcome`` back to the pool."""
        self._check_outcome(outcome)
        self._check_shares(shares)
        with self._lock:
            return self._quote(outcome, shares, side="sell")

    def shares_for_budget(self, outcome: int, budget: float) -> float:
        """How many shares of ``outcome`` a gross budget buys (fee excluded).

        Closed form of ``C(q + δ·e_i) − C(q) = budget``::

            δ = b · ln( (S·e^{budget/b} − S + e^{q_i/b}) / e^{q_i/b} )

        computed in log space for stability.
        """
        self._check_outcome(outcome)
        if budget <= 0:
            raise ValueError("budget must be positive")
        b = self._config.liquidity
        with self._lock:
            scaled = [q / b for q in self._q]
        log_s = _logsumexp(scaled)
        # ln(S·e^{budget/b} − (S − e_i)) via exp-normalized arithmetic.
        log_grown = log_s + budget / b
        peak = max(log_grown, log_s, scaled[outcome])
        inner = (
            math.exp(log_grown - peak)
            - math.exp(log_s - peak)
            + math.exp(scaled[outcome] - peak)
        )
        return b * (peak + math.log(inner) - scaled[outcome])

    # -- execution -----------------------------------------------------

    def execute_buy(self, outcome: int, shares: float) -> Fill:
        """Atomically buys ``shares`` of ``outcome`` at the live state."""
        return self._execute(outcome, shares, side="buy")

    def execute_sell(self, outcome: int, shares: float) -> Fill:
        """Atomically sells ``shares`` of ``outcome`` at the live state."""
        return self._execute(outcome, shares, side="sell")

    # -- internals -----------------------------------------------------

    def _cost(self, quantities: list[float]) -> float:
        b = self._config.liquidity
        return b * _logsumexp([q / b for q in quantities])

    def _quote(self, outcome: int, shares: float, *, side: str) -> Quote:
        delta = shares if side == "buy" else -shares
        before = self._cost(self._q)
        after_q = list(self._q)
        after_q[outcome] += delta
        after = self._cost(after_q)

        gross = after - before if side == "buy" else before - after
        gross = max(0.0, gross)
        fee = gross * self._config.fee_rate
        total = gross + fee if side == "buy" else gross - fee

        prices_before = _softmax([q / self._config.liquidity for q in self._q])
        prices_after = _softmax([q / self._config.liquidity for q in after_q])
        return Quote(
            side=side,
            outcome=outcome,
            shares=shares,
            gross_value=gross,
            fee=fee,
            total=total,
            avg_price=gross / shares if shares else 0.0,
            price_before=prices_before[outcome],
            price_after=prices_after[outcome],
        )

    def _execute(self, outcome: int, shares: float, *, side: str) -> Fill:
        self._check_outcome(outcome)
        self._check_shares(shares)
        with self._lock:
            quote = self._quote(outcome, shares, side=side)
            self._q[outcome] += shares if side == "buy" else -shares
            self._fees_collected += quote.fee
            self._volume += quote.gross_value
            prices = _softmax([q / self._config.liquidity for q in self._q])
        return Fill(
            side=side,
            outcome=outcome,
            shares=shares,
            gross_value=quote.gross_value,
            fee=quote.fee,
            total=quote.total,
            avg_price=quote.avg_price,
            prices=prices,
            filled_at_ms=int(time.time() * 1000),
        )

    def _check_outcome(self, outcome: int) -> int:
        if not 0 <= outcome < self._config.num_outcomes:
            raise ValueError(f"outcome must be in [0, {self._config.num_outcomes})")
        return outcome

    @staticmethod
    def _check_shares(shares: float) -> None:
        if not math.isfinite(shares) or shares <= 0:
            raise ValueError("shares must be a positive finite number")
