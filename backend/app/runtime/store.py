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

    @property
    def yes_price(self) -> float:
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
    demo_account_id: str | None = None
    journal: list[JournalRecord] = field(default_factory=list)
    equity_curve: list[dict[str, float | int]] = field(default_factory=list)
    daily_pnl: float = 0.0
    day_open_equity: float = 0.0
    _lock: threading.RLock = field(default_factory=threading.RLock)

    def record_equity(self) -> None:
        snap = self.bankroll.mark_to_market(_global_store.market_prices())
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
            )

    def market_prices(self) -> dict[str, list[float]]:
        with self._lock:
            return {mid: [m.yes_price, 1 - m.yes_price] for mid, m in self._markets.items()}

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

            prices = self.market_prices()
            snap = session.bankroll.mark_to_market(prices)
            session.risk.on_equity(snap.equity, traded=True)
            session.record_equity()
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
