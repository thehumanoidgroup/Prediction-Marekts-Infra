"""In-memory trading runtime backed by LMSR, bankroll, and risk engines."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field

from app.engine.bankroll import InsufficientFunds, InsufficientShares, VirtualBankroll
from app.engine.lmsr import LMSRConfig, LMSRMarketMaker
from app.engine.risk import (
    ChallengeStatus,
    DrawdownMode,
    OrderIntent,
    RiskEngine,
    RiskLimits,
)
from app.runtime.catalog import DAY_MS, HOUR_MS, MARKET_SEEDS, now_ms


def _clamp_price(p: float) -> float:
    return min(0.97, max(0.03, p))


def infer_market_source(market_id: str) -> str:
    """Map market id prefixes to portfolio provider filters."""
    lower = market_id.lower()
    if lower.startswith("kalshi-"):
        return "kalshi"
    if lower.startswith("poly-") or lower.startswith("0x"):
        return "polymarket"
    if lower.startswith("sp500-"):
        return "sp500_dynamic"
    if lower.startswith("mkt-"):
        return "internal"
    return "external"


@dataclass
class JournalRecord:
    id: str
    kind: str
    market_id: str | None
    market_question: str | None
    outcome: str | None
    side: str | None
    shares: float | None
    price: float | None
    pnl: float | None
    note: str
    tags: list[str]
    executed_at: int


@dataclass
class MarketRuntime:
    seed_id: str
    question: str
    category: str
    maker: LMSRMarketMaker
    volume: float = 0.0
    volume_24h: float = 0.0
    traders: int = 0
    closes_at: int = 0
    history: list[dict[str, float | int]] = field(default_factory=list)
    change_24h: float = 0.0
    # Multi-provider metadata (defaults keep seeded LMSR markets as internal).
    source: str = "internal"
    stock_ticker: str | None = None
    strike_price: float | None = None
    expiration_type: str | None = None
    expiration_date: str | None = None
    resolved_outcome: str | None = None  # "yes" | "no" once settled

    @property
    def yes_price(self) -> float:
        if self.resolved_outcome == "yes":
            return 0.97
        if self.resolved_outcome == "no":
            return 0.03
        return _clamp_price(self.maker.prices()[0])

    def append_history(self, ts: int | None = None) -> None:
        point = {"t": ts or now_ms(), "p": self.yes_price}
        self.history.append(point)
        if len(self.history) > 120:
            self.history = self.history[-120:]


@dataclass
class TraderSession:
    tenant_slug: str
    user_id: str
    bankroll: VirtualBankroll
    risk: RiskEngine
    provider: str = "internal"
    kalshi_market_tickers: list[str] = field(default_factory=list)
    sp500_tickers: list[str] = field(default_factory=list)
    demo_account_id: str | None = None
    external_markets: dict[str, dict] = field(default_factory=dict)
    journal: list[JournalRecord] = field(default_factory=list)
    equity_curve: list[dict[str, float | int]] = field(default_factory=list)
    daily_pnl: float = 0.0
    day_open_equity: float = 0.0
    _lock: threading.RLock = field(default_factory=threading.RLock)

    def record_equity(self, prices: dict[str, list[float]]) -> None:
        snap = self.bankroll.mark_to_market(prices)
        self.equity_curve.append({"t": now_ms(), "p": snap.equity})
        if len(self.equity_curve) > 90:
            self.equity_curve = self.equity_curve[-90:]
        self.daily_pnl = snap.equity - self.day_open_equity


class TradingStore:
    """Process-wide trading state — one session per (tenant_slug, user_id)."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._markets: dict[str, MarketRuntime] = {}
        self._sessions: dict[tuple[str, str], TraderSession] = {}
        self._seed_markets()

    def _seed_markets(self) -> None:
        ts = now_ms()
        for seed in MARKET_SEEDS:
            maker = LMSRMarketMaker(LMSRConfig(num_outcomes=2, liquidity=400, fee_rate=0.01))
            target = seed.base_price
            for _ in range(24):
                current = maker.prices()[0]
                if abs(current - target) < 0.015:
                    break
                if current < target:
                    maker.execute_buy(0, 40)
                else:
                    maker.execute_buy(1, 40)
            history = [{"t": ts - (11 - i) * HOUR_MS, "p": seed.base_price} for i in range(12)]
            self._markets[seed.id] = MarketRuntime(
                seed_id=seed.id,
                question=seed.question,
                category=seed.category,
                maker=maker,
                volume=seed.volume_scale * 900_000,
                volume_24h=seed.volume_scale * 50_000,
                traders=int(120 + seed.volume_scale * 50),
                closes_at=ts + seed.days_to_close * DAY_MS,
                history=history,
                source="internal",
            )

    def create_market(
        self,
        *,
        market_id: str,
        question: str,
        category: str,
        base_price: float,
        closes_at: int,
        volume_scale: float = 1.0,
        source: str = "internal",
        stock_ticker: str | None = None,
        strike_price: float | None = None,
        expiration_type: str | None = None,
        expiration_date: str | None = None,
        liquidity: float = 400.0,
    ) -> tuple[MarketRuntime, bool]:
        """Create an LMSR market or return the existing one (idempotent).

        Returns ``(market, created)`` where ``created`` is False when
        ``market_id`` was already present.
        """
        with self._lock:
            existing = self._markets.get(market_id)
            if existing is not None:
                return existing, False

            maker = LMSRMarketMaker(
                LMSRConfig(num_outcomes=2, liquidity=liquidity, fee_rate=0.01)
            )
            target = _clamp_price(base_price)
            for _ in range(24):
                current = maker.prices()[0]
                if abs(current - target) < 0.015:
                    break
                if current < target:
                    maker.execute_buy(0, 40)
                else:
                    maker.execute_buy(1, 40)

            ts = now_ms()
            history = [{"t": ts - (11 - i) * HOUR_MS, "p": target} for i in range(12)]
            runtime = MarketRuntime(
                seed_id=market_id,
                question=question,
                category=category,
                maker=maker,
                volume=volume_scale * 900_000,
                volume_24h=volume_scale * 50_000,
                traders=int(120 + volume_scale * 50),
                closes_at=closes_at,
                history=history,
                source=source,
                stock_ticker=stock_ticker,
                strike_price=strike_price,
                expiration_type=expiration_type,
                expiration_date=expiration_date,
            )
            self._markets[market_id] = runtime
            return runtime, True

    def market_prices(self) -> dict[str, list[float]]:
        with self._lock:
            return {mid: [m.yes_price, 1 - m.yes_price] for mid, m in self._markets.items()}

    def market_prices_for_session(self, session: TraderSession) -> dict[str, list[float]]:
        """LMSR prices merged with cached external (Kalshi/Polymarket) quotes."""
        prices = self.market_prices()
        for market_id, meta in session.external_markets.items():
            yes = float(meta.get("yesPrice") or 0.5)
            prices[market_id] = [yes, 1.0 - yes]
        return prices

    def apply_price_tick(self, market_id: str, yes_price: float) -> None:
        """Sync LMSR state to an external tick (WebSocket broadcaster)."""
        with self._lock:
            market = self._markets.get(market_id)
            if market is None:
                return
            # Nudge inventory toward target price via small synthetic trade
            current = market.yes_price
            delta = yes_price - current
            if abs(delta) < 0.001:
                return
            outcome = 0 if delta > 0 else 1
            try:
                market.maker.execute_buy(outcome, max(1, int(abs(delta) * 500)))
            except Exception:  # noqa: BLE001
                pass
            market.append_history()
            if market.history:
                day_ago = now_ms() - DAY_MS
                old = next((p["p"] for p in market.history if p["t"] >= day_ago), market.history[0]["p"])
                market.change_24h = market.yes_price - float(old)

    def get_session(
        self,
        tenant_slug: str,
        user_id: str,
        program: dict,
        *,
        provider: str = "internal",
        kalshi_market_tickers: list[str] | None = None,
        sp500_tickers: list[str] | None = None,
        demo_account_id: str | None = None,
    ) -> TraderSession:
        key = (tenant_slug, user_id)
        with self._lock:
            if key in self._sessions:
                return self._sessions[key]

            sizes = program.get("account_sizes") or [25_000]
            starting = float(program.get("starting_balance") or sizes[min(1, len(sizes) - 1)])
            limits = RiskLimits(
                starting_balance=starting,
                profit_target_pct=float(program.get("profit_target_pct", 10)),
                max_daily_loss_pct=float(program.get("max_daily_loss_pct", 5)),
                max_drawdown_pct=float(program.get("max_drawdown_pct", 10)),
                drawdown_mode=DrawdownMode(program.get("drawdown_mode", "static")),
                absolute_floor=program.get("absolute_floor"),
                trailing_locks_at_start=bool(program.get("trailing_locks_at_start", True)),
                max_stake_per_order=float(program.get("max_stake_per_order", 2500)),
                max_exposure_per_market=float(program.get("max_exposure_per_market", 5000)),
                max_total_exposure=program.get("max_total_exposure"),
                min_trading_days=int(program.get("min_trading_days", 10)),
            )
            bankroll = VirtualBankroll(starting_balance=starting)
            risk = RiskEngine(limits)
            session = TraderSession(
                tenant_slug=tenant_slug,
                user_id=user_id,
                bankroll=bankroll,
                risk=risk,
                provider=provider,
                kalshi_market_tickers=list(kalshi_market_tickers or []),
                sp500_tickers=list(sp500_tickers or []),
                demo_account_id=demo_account_id,
                day_open_equity=starting,
            )
            # Seed equity curve with mild upward bias (30 points)
            equity = starting
            for i in range(30):
                equity += (i % 5 - 2) * starting * 0.001
                session.equity_curve.append(
                    {"t": now_ms() - (29 - i) * DAY_MS, "p": round(equity, 2)}
                )
            self._sessions[key] = session
            return session

    def reset_session(
        self,
        tenant_slug: str,
        user_id: str,
        program: dict,
        *,
        provider: str = "internal",
        kalshi_market_tickers: list[str] | None = None,
        sp500_tickers: list[str] | None = None,
        demo_account_id: str | None = None,
    ) -> TraderSession:
        """Replace an existing in-memory session (e.g. after re-provisioning)."""
        key = (tenant_slug, user_id)
        with self._lock:
            self._sessions.pop(key, None)
        return self.get_session(
            tenant_slug,
            user_id,
            program,
            provider=provider,
            kalshi_market_tickers=kalshi_market_tickers,
            sp500_tickers=sp500_tickers,
            demo_account_id=demo_account_id,
        )

    def list_markets(
        self,
        *,
        category: str | None = None,
        query: str = "",
        sort: str = "volume",
    ) -> list[MarketRuntime]:
        with self._lock:
            markets = list(self._markets.values())
        if category and category != "all":
            markets = [m for m in markets if m.category == category]
        if query:
            q = query.lower()
            markets = [m for m in markets if q in m.question.lower()]
        if sort == "closing":
            markets.sort(key=lambda m: m.closes_at)
        elif sort == "movers":
            markets.sort(key=lambda m: abs(m.change_24h), reverse=True)
        elif sort == "newest":
            markets.sort(key=lambda m: m.closes_at, reverse=True)
        else:
            markets.sort(key=lambda m: m.volume, reverse=True)
        return markets

    def get_market(self, market_id: str) -> MarketRuntime | None:
        with self._lock:
            return self._markets.get(market_id)

    def iter_sessions(self) -> list[TraderSession]:
        with self._lock:
            return list(self._sessions.values())

    def settle_market_all_sessions(
        self,
        market_id: str,
        winning_outcome: int,
    ) -> list[tuple[tuple[str, str], list]]:
        """Pay out every trader session holding the market via VirtualBankroll.settle_market.

        ``winning_outcome``: ``0`` = Yes, ``1`` = No.
        Returns ``[((tenant_slug, user_id), ledger_entries), ...]``.
        """
        outcome_label = "yes" if winning_outcome == 0 else "no"
        settled: list[tuple[tuple[str, str], list]] = []
        market_question = market_id

        with self._lock:
            market = self._markets.get(market_id)
            if market is not None:
                market.resolved_outcome = outcome_label
                # Force serializer status to resolved.
                market.closes_at = min(market.closes_at or now_ms(), now_ms())
                market_question = market.question

            sessions = list(self._sessions.values())

        for session in sessions:
            with session._lock:
                entries = session.bankroll.settle_market(market_id, winning_outcome)
                if not entries:
                    continue
                prices = self.market_prices_for_session(session)
                snap = session.bankroll.mark_to_market(prices)
                session.risk.on_equity(snap.equity, traded=True)
                session.record_equity(prices)
                session.journal.append(
                    JournalRecord(
                        id=str(uuid.uuid4()),
                        kind="trade",
                        market_id=market_id,
                        market_question=market_question,
                        outcome=outcome_label,
                        side=None,
                        shares=None,
                        price=1.0 if winning_outcome == 0 else 0.0,
                        pnl=sum(float(e.amount) for e in entries),
                        note=f"Market resolved {outcome_label.upper()}",
                        tags=["settlement", "sp500_dynamic"],
                        executed_at=now_ms(),
                    )
                )
                settled.append(((session.tenant_slug, session.user_id), entries))

        return settled

    def sync_session_risk(self, session: TraderSession) -> list:
        """Re-mark open positions and run real-time drawdown / daily-loss checks."""
        with session._lock:
            prices = self.market_prices_for_session(session)
            snap = session.bankroll.mark_to_market(prices)
            events = session.risk.on_equity(snap.equity, traded=False)
            session.record_equity(prices)
            return events

    def _estimate_buy_stake(
        self,
        session: TraderSession,
        *,
        market_id: str,
        outcome: str,
        shares: int,
        yes_price: float | None = None,
    ) -> float:
        outcome_idx = 0 if outcome == "yes" else 1
        external_priced = (
            market_id.lower().startswith("kalshi-")
            or market_id.lower().startswith("sp500-")
            or market_id.lower().startswith("poly-")
            or market_id.lower().startswith("0x")
            or market_id in session.external_markets
        )
        if external_priced and (
            market_id.lower().startswith("kalshi-")
            or market_id.lower().startswith("poly-")
            or market_id.lower().startswith("0x")
            or market_id in session.external_markets
            or self.get_market(market_id) is None
        ):
            clamped = _clamp_price(float(yes_price if yes_price is not None else 0.5))
            fill_price = clamped if outcome_idx == 0 else (1.0 - clamped)
            gross = fill_price * shares
            return gross + gross * 0.01

        market = self.get_market(market_id)
        if market is None:
            raise ValueError(f"Unknown market: {market_id}")
        quote = market.maker.quote_buy(outcome_idx, shares)
        return quote.total

    def preview_order_risk(
        self,
        session: TraderSession,
        *,
        market_id: str,
        outcome: str,
        side: str,
        shares: int,
        yes_price: float | None = None,
    ) -> dict:
        """Dry-run an order against the same risk rules used at fill time."""
        if shares <= 0:
            return {
                "allowed": False,
                "reasons": ["Shares must be positive"],
                "violations": [],
                "stake": 0.0,
                "side": side,
            }

        limits = session.risk.limits
        with session._lock:
            if session.risk.status is not ChallengeStatus.ACTIVE:
                return {
                    "allowed": False,
                    "reasons": [f"Challenge is {session.risk.status.value}; trading closed"],
                    "violations": [],
                    "stake": 0.0,
                    "side": side,
                    "challengeStatus": session.risk.status.value,
                }

        if side == "sell":
            outcome_idx = 0 if outcome == "yes" else 1
            held = next(
                (
                    p.shares
                    for p in session.bankroll.positions()
                    if p.market_id == market_id and p.outcome == outcome_idx
                ),
                0.0,
            )
            if held < shares:
                return {
                    "allowed": False,
                    "reasons": [f"Only {held:.0f} shares available to sell"],
                    "violations": [],
                    "stake": 0.0,
                    "side": side,
                }
            return {
                "allowed": True,
                "reasons": [],
                "violations": [],
                "stake": 0.0,
                "side": side,
            }

        try:
            stake = self._estimate_buy_stake(
                session,
                market_id=market_id,
                outcome=outcome,
                shares=shares,
                yes_price=yes_price,
            )
        except ValueError as exc:
            return {
                "allowed": False,
                "reasons": [str(exc)],
                "violations": [],
                "stake": 0.0,
                "side": side,
            }

        decision = session.risk.check_order(
            OrderIntent(
                market_id=market_id,
                stake=stake,
                current_market_exposure=session.bankroll.market_exposure(market_id),
                current_total_exposure=session.bankroll.total_exposure(),
            )
        )
        cash = session.bankroll.cash
        return {
            "allowed": decision.allowed and stake <= cash,
            "reasons": list(decision.reasons)
            + (["Insufficient balance"] if stake > cash else []),
            "violations": [v.value for v in decision.violations],
            "stake": round(stake, 2),
            "side": side,
            "projectedMarketExposure": round(
                session.bankroll.market_exposure(market_id) + stake, 2
            ),
            "projectedTotalExposure": round(session.bankroll.total_exposure() + stake, 2),
            "maxStakePerOrder": limits.max_stake_per_order,
            "maxExposurePerMarket": limits.max_exposure_per_market,
            "maxTotalExposure": limits.max_total_exposure,
            "challengeStatus": session.risk.status.value,
        }

    def place_order(
        self,
        session: TraderSession,
        *,
        market_id: str,
        outcome: str,
        side: str,
        shares: int,
    ) -> dict:
        if shares <= 0:
            raise ValueError("Shares must be positive")
        market = self.get_market(market_id)
        if market is None:
            raise ValueError(f"Unknown market: {market_id}")

        outcome_idx = 0 if outcome == "yes" else 1

        with session._lock:
            if session.risk.status is not ChallengeStatus.ACTIVE:
                raise ValueError(f"Challenge is {session.risk.status.value}; trading closed")

            if side == "buy":
                quote = market.maker.quote_buy(outcome_idx, shares)
                decision = session.risk.check_order(
                    OrderIntent(
                        market_id=market_id,
                        stake=quote.total,
                        current_market_exposure=session.bankroll.market_exposure(market_id),
                        current_total_exposure=session.bankroll.total_exposure(),
                    )
                )
                if not decision.allowed:
                    raise ValueError("; ".join(decision.reasons) or "Order rejected by risk engine")
                try:
                    fill = market.maker.execute_buy(outcome_idx, shares)
                    session.bankroll.apply_buy(
                        market_id,
                        outcome=outcome_idx,
                        shares=shares,
                        gross_value=fill.gross_value,
                        fee=fill.fee,
                    )
                except InsufficientFunds as exc:
                    raise ValueError("Insufficient balance") from exc
            else:
                try:
                    fill = market.maker.execute_sell(outcome_idx, shares)
                    session.bankroll.apply_sell(
                        market_id,
                        outcome=outcome_idx,
                        shares=shares,
                        gross_value=fill.gross_value,
                        fee=fill.fee,
                    )
                except InsufficientShares as exc:
                    raise ValueError("Not enough shares to sell") from exc

            prices = self.market_prices_for_session(session)
            snap = session.bankroll.mark_to_market(prices)
            session.risk.on_equity(snap.equity, traded=True)
            session.record_equity(prices)
            market.volume += shares * market.yes_price
            market.volume_24h += shares * market.yes_price

            price = market.maker.prices()[outcome_idx]
            order_id = f"ord-{uuid.uuid4().hex[:8]}"
            session.journal.insert(
                0,
                JournalRecord(
                    id=f"jnl-{uuid.uuid4().hex[:8]}",
                    kind="trade",
                    market_id=market_id,
                    market_question=market.question,
                    outcome=outcome,
                    side=side,
                    shares=float(shares),
                    price=price,
                    pnl=None,
                    note="",
                    tags=[],
                    executed_at=now_ms(),
                ),
            )

            pos = next(
                (
                    p
                    for p in session.bankroll.positions()
                    if p.market_id == market_id and p.outcome == outcome_idx
                ),
                None,
            )
            position = None
            if pos and pos.shares > 0:
                position = {
                    "id": f"pos-{market_id}-{outcome}",
                    "marketId": market_id,
                    "outcome": outcome,
                    "shares": pos.shares,
                    "avgPrice": pos.avg_price,
                    "openedAt": now_ms(),
                }

            return {
                "order": {
                    "id": order_id,
                    "marketId": market_id,
                    "outcome": outcome,
                    "side": side,
                    "shares": shares,
                    "price": price,
                    "filledAt": now_ms(),
                },
                "position": position,
            }

    def place_external_order(
        self,
        session: TraderSession,
        *,
        market_id: str,
        market_question: str,
        outcome: str,
        side: str,
        shares: int,
        yes_price: float,
        category: str = "economics",
    ) -> dict:
        """Virtual fill at an external provider price (Kalshi, etc.)."""
        if shares <= 0:
            raise ValueError("Shares must be positive")

        yes_price = _clamp_price(yes_price)
        outcome_idx = 0 if outcome == "yes" else 1
        fill_price = yes_price if outcome_idx == 0 else (1.0 - yes_price)
        fee_rate = 0.01

        with session._lock:
            if session.risk.status is not ChallengeStatus.ACTIVE:
                raise ValueError(f"Challenge is {session.risk.status.value}; trading closed")

            gross = fill_price * shares
            fee = gross * fee_rate

            if side == "buy":
                decision = session.risk.check_order(
                    OrderIntent(
                        market_id=market_id,
                        stake=gross + fee,
                        current_market_exposure=session.bankroll.market_exposure(market_id),
                        current_total_exposure=session.bankroll.total_exposure(),
                    )
                )
                if not decision.allowed:
                    raise ValueError("; ".join(decision.reasons) or "Order rejected by risk engine")
                try:
                    session.bankroll.apply_buy(
                        market_id,
                        outcome=outcome_idx,
                        shares=shares,
                        gross_value=gross,
                        fee=fee,
                    )
                except InsufficientFunds as exc:
                    raise ValueError("Insufficient balance") from exc
            else:
                try:
                    session.bankroll.apply_sell(
                        market_id,
                        outcome=outcome_idx,
                        shares=shares,
                        gross_value=gross,
                        fee=fee,
                    )
                except InsufficientShares as exc:
                    raise ValueError("Not enough shares to sell") from exc

            session.external_markets[market_id] = {
                "id": market_id,
                "question": market_question,
                "category": category,
                "yesPrice": yes_price,
                "source": infer_market_source(market_id),
            }

            prices = self.market_prices_for_session(session)
            snap = session.bankroll.mark_to_market(prices)
            session.risk.on_equity(snap.equity, traded=True)
            session.record_equity(prices)

            order_id = f"ord-{uuid.uuid4().hex[:8]}"
            session.journal.insert(
                0,
                JournalRecord(
                    id=f"jnl-{uuid.uuid4().hex[:8]}",
                    kind="trade",
                    market_id=market_id,
                    market_question=market_question,
                    outcome=outcome,
                    side=side,
                    shares=float(shares),
                    price=fill_price,
                    pnl=None,
                    note="",
                    tags=[infer_market_source(market_id)],
                    executed_at=now_ms(),
                ),
            )

            pos = next(
                (
                    p
                    for p in session.bankroll.positions()
                    if p.market_id == market_id and p.outcome == outcome_idx
                ),
                None,
            )
            position = None
            if pos and pos.shares > 0:
                position = {
                    "id": f"pos-{market_id}-{outcome}",
                    "marketId": market_id,
                    "outcome": outcome,
                    "shares": pos.shares,
                    "avgPrice": pos.avg_price,
                    "openedAt": now_ms(),
                }

            return {
                "order": {
                    "id": order_id,
                    "marketId": market_id,
                    "outcome": outcome,
                    "side": side,
                    "shares": shares,
                    "price": fill_price,
                    "filledAt": now_ms(),
                },
                "position": position,
            }

    def add_note(self, session: TraderSession, note: str, tags: list[str]) -> JournalRecord:
        entry = JournalRecord(
            id=f"jnl-note-{uuid.uuid4().hex[:8]}",
            kind="note",
            market_id=None,
            market_question=None,
            outcome=None,
            side=None,
            shares=None,
            price=None,
            pnl=None,
            note=note[:2000],
            tags=tags[:5],
            executed_at=now_ms(),
        )
        with session._lock:
            session.journal.insert(0, entry)
        return entry


_global_store = TradingStore()


def get_trading_store() -> TradingStore:
    return _global_store
