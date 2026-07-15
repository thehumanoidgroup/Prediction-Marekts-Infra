"""Risk & challenge engine: drawdown enforcement and stake limits.

One ``RiskEngine`` guards one challenge account. It answers two questions:

1. **Pre-trade** — may this order be placed? (:meth:`RiskEngine.check_order`)
   Enforces per-order stake caps, per-market exposure caps, and total
   exposure caps from the firm's :class:`RiskLimits`.

2. **Real-time** — is the account still alive? (:meth:`RiskEngine.on_equity`)
   Called on every fill *and* every mark-to-market tick. Enforces the
   daily-loss limit and the configured drawdown policy, tracks the
   high-water mark, and transitions the challenge to PASSED/FAILED.

Supported drawdown modes (:class:`DrawdownMode`):

- ``STATIC``   — floor fixed at ``start · (1 − max_drawdown_pct)``.
- ``TRAILING`` — floor trails the equity high-water mark by the drawdown
  amount; optionally locks at the starting balance once reached
  (the common prop-firm "trailing until breakeven" rule).
- ``ABSOLUTE`` — floor is an explicit equity value, e.g. $48,000 on a
  $50,000 account, regardless of percentages.

The engine is thread-safe (``RLock``) and event-sourced: every breach or
status transition is returned as a :class:`RiskEvent` for the API layer to
persist and broadcast over WebSockets.
"""

from __future__ import annotations

import enum
import threading
import time

from pydantic import BaseModel, Field, model_validator


def _now_ms() -> int:
    return int(time.time() * 1000)


class DrawdownMode(str, enum.Enum):
    STATIC = "static"
    TRAILING = "trailing"
    ABSOLUTE = "absolute"


class ChallengeStatus(str, enum.Enum):
    ACTIVE = "active"
    PASSED = "passed"
    FAILED = "failed"


class BreachType(str, enum.Enum):
    DAILY_LOSS = "daily_loss"
    MAX_DRAWDOWN = "max_drawdown"
    STAKE_PER_ORDER = "stake_per_order"
    MARKET_EXPOSURE = "market_exposure"
    TOTAL_EXPOSURE = "total_exposure"


class RiskLimits(BaseModel):
    """A firm's challenge rules — one immutable config per program tier.

    These map 1:1 to what firms configure in the tenant ``program`` JSON;
    the API layer builds this model from tenant config at account creation.

    Attributes:
        starting_balance: Virtual funding of the account.
        profit_target_pct: Equity gain (as % of start) that passes the
            challenge, e.g. 10 → pass at 110% of start.
        max_daily_loss_pct: Loss from the day's opening equity that fails
            the account, as % of starting balance.
        drawdown_mode: Which floor policy applies (static/trailing/absolute).
        max_drawdown_pct: Drawdown size for static/trailing modes, as % of
            starting balance.
        absolute_floor: Explicit equity floor (ABSOLUTE mode only).
        trailing_locks_at_start: TRAILING only — once the floor has trailed
            up to the starting balance it stops moving (breakeven lock).
        max_stake_per_order: Max gross stake on a single pick (order).
        max_exposure_per_market: Max total cost basis at risk in one market.
        max_total_exposure: Max total cost basis across all markets.
        min_trading_days: Days with ≥1 trade required before passing.
    """

    model_config = {"frozen": True}

    starting_balance: float = Field(gt=0)
    profit_target_pct: float = Field(default=10.0, gt=0)
    max_daily_loss_pct: float = Field(default=5.0, gt=0)

    drawdown_mode: DrawdownMode = DrawdownMode.STATIC
    max_drawdown_pct: float = Field(default=10.0, gt=0)
    absolute_floor: float | None = Field(default=None, gt=0)
    trailing_locks_at_start: bool = True

    max_stake_per_order: float | None = Field(default=None, gt=0)
    max_exposure_per_market: float | None = Field(default=None, gt=0)
    max_total_exposure: float | None = Field(default=None, gt=0)

    min_trading_days: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _absolute_needs_floor(self) -> "RiskLimits":
        if self.drawdown_mode is DrawdownMode.ABSOLUTE:
            if self.absolute_floor is None:
                raise ValueError("ABSOLUTE drawdown mode requires absolute_floor")
            if self.absolute_floor >= self.starting_balance:
                raise ValueError("absolute_floor must be below starting_balance")
        return self


class OrderIntent(BaseModel):
    """What a trader is about to do, expressed in risk terms."""

    market_id: str
    stake: float = Field(gt=0)  # gross cash at risk (cost + fee)
    current_market_exposure: float = Field(default=0.0, ge=0)
    current_total_exposure: float = Field(default=0.0, ge=0)


class RiskDecision(BaseModel):
    """Verdict on an order. ``allowed=False`` lists every violated rule."""

    allowed: bool
    violations: list[BreachType] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class RiskEvent(BaseModel):
    """A breach or lifecycle transition, for persistence + broadcast."""

    type: BreachType | None = None
    status: ChallengeStatus
    equity: float
    threshold: float | None = None
    message: str
    ts_ms: int = Field(default_factory=_now_ms)


class ChallengeProgress(BaseModel):
    """Live objective tracker (feeds the dashboard objectives card)."""

    status: ChallengeStatus
    equity: float
    high_water_mark: float
    drawdown_floor: float
    daily_loss_used: float
    daily_loss_limit: float
    profit_target: float
    profit_achieved: float
    trading_days: int
    min_trading_days: int


class RiskEngine:
    """Real-time challenge guardian for one account.

    Composed with the bankroll::

        engine = RiskEngine(limits)
        decision = engine.check_order(OrderIntent(...))   # before the fill
        if decision.allowed:
            fill = market_maker.execute_buy(...)
            bankroll.apply_buy(...)
            events = engine.on_equity(bankroll.mark_to_market(...).equity)

    ``on_equity`` must also be called when marks move without the trader
    acting (price ticks) — that is what makes enforcement *real-time*
    rather than trade-time only.
    """

    def __init__(self, limits: RiskLimits) -> None:
        self._limits = limits
        self._status = ChallengeStatus.ACTIVE
        self._equity = limits.starting_balance
        self._hwm = limits.starting_balance
        self._day_open_equity = limits.starting_balance
        self._trading_days = 0
        self._traded_today = False
        self._events: list[RiskEvent] = []
        self._lock = threading.RLock()

    # -- reads ---------------------------------------------------------

    @property
    def limits(self) -> RiskLimits:
        return self._limits

    @property
    def status(self) -> ChallengeStatus:
        with self._lock:
            return self._status

    def drawdown_floor(self) -> float:
        """Equity level at which the account fails, per the active policy."""
        limits = self._limits
        with self._lock:
            if limits.drawdown_mode is DrawdownMode.ABSOLUTE:
                return limits.absolute_floor  # type: ignore[return-value]
            dd_amount = limits.starting_balance * limits.max_drawdown_pct / 100
            if limits.drawdown_mode is DrawdownMode.STATIC:
                return limits.starting_balance - dd_amount
            # TRAILING
            floor = self._hwm - dd_amount
            if limits.trailing_locks_at_start:
                floor = min(floor, limits.starting_balance)
            return floor

    def progress(self) -> ChallengeProgress:
        limits = self._limits
        with self._lock:
            target = limits.starting_balance * (1 + limits.profit_target_pct / 100)
            return ChallengeProgress(
                status=self._status,
                equity=self._equity,
                high_water_mark=self._hwm,
                drawdown_floor=self.drawdown_floor(),
                daily_loss_used=max(0.0, self._day_open_equity - self._equity),
                daily_loss_limit=limits.starting_balance * limits.max_daily_loss_pct / 100,
                profit_target=target,
                profit_achieved=self._equity - limits.starting_balance,
                trading_days=self._trading_days + (1 if self._traded_today else 0),
                min_trading_days=limits.min_trading_days,
            )

    def events(self) -> list[RiskEvent]:
        with self._lock:
            return list(self._events)

    # -- pre-trade enforcement ------------------------------------------

    def check_order(self, intent: OrderIntent) -> RiskDecision:
        """Validates an order against stake and exposure limits.

        Also rejects everything once the challenge is no longer ACTIVE.
        """
        limits = self._limits
        violations: list[BreachType] = []
        reasons: list[str] = []

        with self._lock:
            if self._status is not ChallengeStatus.ACTIVE:
                return RiskDecision(
                    allowed=False,
                    violations=[],
                    reasons=[f"Challenge is {self._status.value}; trading is closed"],
                )

        if limits.max_stake_per_order is not None and intent.stake > limits.max_stake_per_order:
            violations.append(BreachType.STAKE_PER_ORDER)
            reasons.append(
                f"Stake {intent.stake:.2f} exceeds per-pick limit "
                f"{limits.max_stake_per_order:.2f}"
            )
        if limits.max_exposure_per_market is not None:
            projected = intent.current_market_exposure + intent.stake
            if projected > limits.max_exposure_per_market:
                violations.append(BreachType.MARKET_EXPOSURE)
                reasons.append(
                    f"Market exposure would reach {projected:.2f}, above the "
                    f"{limits.max_exposure_per_market:.2f} cap for a single market"
                )
        if limits.max_total_exposure is not None:
            projected = intent.current_total_exposure + intent.stake
            if projected > limits.max_total_exposure:
                violations.append(BreachType.TOTAL_EXPOSURE)
                reasons.append(
                    f"Total exposure would reach {projected:.2f}, above the "
                    f"{limits.max_total_exposure:.2f} account cap"
                )

        return RiskDecision(allowed=not violations, violations=violations, reasons=reasons)

    # -- real-time enforcement ------------------------------------------

    def on_equity(self, equity: float, *, traded: bool = False) -> list[RiskEvent]:
        """Feeds a fresh equity mark into the engine.

        Updates the high-water mark, then evaluates (in order): max
        drawdown, daily loss, and the profit target. Returns any events
        emitted by this update; the account fails/passes at most once.
        """
        limits = self._limits
        emitted: list[RiskEvent] = []

        with self._lock:
            if self._status is not ChallengeStatus.ACTIVE:
                return []

            self._equity = equity
            if traded:
                self._traded_today = True
            # Floor is computed against the *previous* HWM so a new high
            # can't retroactively raise the bar within the same tick.
            floor = self.drawdown_floor()
            self._hwm = max(self._hwm, equity)

            if equity <= floor:
                emitted.append(self._fail(BreachType.MAX_DRAWDOWN, equity, floor))
            else:
                daily_limit = limits.starting_balance * limits.max_daily_loss_pct / 100
                daily_loss = self._day_open_equity - equity
                if daily_loss >= daily_limit:
                    emitted.append(
                        self._fail(BreachType.DAILY_LOSS, equity, self._day_open_equity - daily_limit)
                    )

            if self._status is ChallengeStatus.ACTIVE:
                target = limits.starting_balance * (1 + limits.profit_target_pct / 100)
                days = self._trading_days + (1 if self._traded_today else 0)
                if equity >= target and days >= limits.min_trading_days:
                    self._status = ChallengeStatus.PASSED
                    event = RiskEvent(
                        status=self._status,
                        equity=equity,
                        threshold=target,
                        message=f"Profit target reached at {equity:.2f} — challenge passed",
                    )
                    self._events.append(event)
                    emitted.append(event)

        return emitted

    def start_trading_day(self, opening_equity: float | None = None) -> None:
        """Rolls the daily loss anchor; call at the firm's daily reset time."""
        with self._lock:
            if self._traded_today:
                self._trading_days += 1
                self._traded_today = False
            self._day_open_equity = opening_equity if opening_equity is not None else self._equity

    # -- internals -------------------------------------------------------

    def _fail(self, breach: BreachType, equity: float, threshold: float) -> RiskEvent:
        self._status = ChallengeStatus.FAILED
        event = RiskEvent(
            type=breach,
            status=self._status,
            equity=equity,
            threshold=threshold,
            message=(
                f"{breach.value.replace('_', ' ').capitalize()} breached: "
                f"equity {equity:.2f} vs threshold {threshold:.2f} — challenge failed"
            ),
        )
        self._events.append(event)
        return event
