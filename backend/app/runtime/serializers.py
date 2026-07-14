"""Serializers: runtime state → frontend-compatible JSON (camelCase)."""

from __future__ import annotations

from app.engine.risk import ChallengeStatus
from app.runtime.catalog import now_ms
from app.runtime.store import JournalRecord, MarketRuntime, TraderSession, TradingStore


def _phase(status: ChallengeStatus) -> str:
    if status.value == "passed":
        return "funded"
    return "evaluation"


def _market_status(closes_at: int) -> str:
    remaining = closes_at - now_ms()
    if remaining <= 0:
        return "resolved"
    if remaining < 14 * 24 * 3_600_000:
        return "closing_soon"
    return "open"


def serialize_market(m: MarketRuntime) -> dict:
    return {
        "id": m.seed_id,
        "question": m.question,
        "category": m.category,
        "status": _market_status(m.closes_at),
        "yesPrice": m.yes_price,
        "change24h": m.change_24h,
        "volume": round(m.volume),
        "volume24h": round(m.volume_24h),
        "openInterest": round(m.volume * 0.35),
        "traders": m.traders,
        "closesAt": m.closes_at,
        "history": m.history,
        "source": "internal",
    }


def serialize_journal(entry: JournalRecord) -> dict:
    return {
        "id": entry.id,
        "kind": entry.kind,
        "marketId": entry.market_id,
        "marketQuestion": entry.market_question,
        "outcome": entry.outcome,
        "side": entry.side,
        "shares": entry.shares,
        "price": entry.price,
        "pnl": entry.pnl,
        "note": entry.note,
        "tags": entry.tags,
        "executedAt": entry.executed_at,
    }


def serialize_account(session: TraderSession, store: TradingStore) -> dict:
    prices = store.market_prices()
    snap = session.bankroll.mark_to_market(prices)
    progress = session.risk.progress()
    limits = session.risk.limits
    starting = limits.starting_balance
    profit_target_usd = starting * limits.profit_target_pct / 100
    max_daily_usd = starting * limits.max_daily_loss_pct / 100
    max_dd_usd = starting * limits.max_drawdown_pct / 100

    objectives = [
        {
            "id": "profit-target",
            "label": "Profit target",
            "current": max(0.0, progress.profit_achieved),
            "target": profit_target_usd,
            "inverted": False,
            "unit": "usd",
            "met": progress.profit_achieved >= profit_target_usd,
        },
        {
            "id": "daily-loss",
            "label": "Max daily loss",
            "current": progress.daily_loss_used,
            "target": max_daily_usd,
            "inverted": True,
            "unit": "usd",
            "met": progress.daily_loss_used < max_daily_usd,
        },
        {
            "id": "max-drawdown",
            "label": "Max drawdown",
            "current": max(0.0, progress.high_water_mark - snap.equity),
            "target": max_dd_usd,
            "inverted": True,
            "unit": "usd",
            "met": snap.equity > progress.drawdown_floor,
        },
        {
            "id": "trading-days",
            "label": "Min trading days",
            "current": progress.trading_days,
            "target": progress.min_trading_days,
            "inverted": False,
            "unit": "days",
            "met": progress.trading_days >= progress.min_trading_days,
        },
    ]

    return {
        "id": f"acct-{session.tenant_slug}-{session.user_id[:8]}",
        "label": f"{int(starting / 1000)}K Evaluation",
        "phase": _phase(progress.status),
        "provider": session.provider,
        "kalshiMarketTickers": session.kalshi_market_tickers,
        "demoAccountId": session.demo_account_id,
        "startingBalance": starting,
        "balance": round(snap.cash),
        "equity": round(snap.equity),
        "dailyPnl": round(session.daily_pnl),
        "totalPnl": round(snap.total_pnl),
        "maxDailyLossPct": limits.max_daily_loss_pct,
        "maxDrawdownPct": limits.max_drawdown_pct,
        "profitTargetPct": limits.profit_target_pct,
        "daysTraded": progress.trading_days,
        "minTradingDays": progress.min_trading_days,
        "startedAt": session.equity_curve[0]["t"] if session.equity_curve else now_ms(),
        "objectives": objectives,
        "equityCurve": session.equity_curve,
    }


def serialize_position(session: TraderSession, store: TradingStore) -> list[dict]:
    prices = store.market_prices()
    enriched = []
    for pos in session.bankroll.positions():
        market = store.get_market(pos.market_id)
        if market is None:
            continue
        outcome = "yes" if pos.outcome == 0 else "no"
        market_prices = prices.get(pos.market_id, [0.5, 0.5])
        current = market_prices[pos.outcome]
        value = current * pos.shares
        cost = pos.avg_price * pos.shares
        pnl = value - cost
        enriched.append(
            {
                "id": f"pos-{pos.market_id}-{outcome}",
                "marketId": pos.market_id,
                "outcome": outcome,
                "shares": pos.shares,
                "avgPrice": pos.avg_price,
                "openedAt": now_ms(),
                "market": serialize_market(market),
                "currentPrice": current,
                "value": value,
                "cost": cost,
                "pnl": pnl,
                "pnlPct": (pnl / cost * 100) if cost > 0 else 0.0,
            }
        )
    return enriched


def serialize_portfolio_summary(session: TraderSession, store: TradingStore) -> dict:
    prices = store.market_prices()
    snap = session.bankroll.mark_to_market(prices)
    positions = serialize_position(session, store)
    open_pnl = sum(p["pnl"] for p in positions)
    closed = [j for j in session.journal if j.pnl is not None]
    wins = [j for j in closed if (j.pnl or 0) > 0]

    return {
        "balance": round(snap.cash),
        "equity": round(snap.equity),
        "openPnl": round(open_pnl, 2),
        "dailyPnl": round(session.daily_pnl, 2),
        "totalPnl": round(snap.total_pnl, 2),
        "winRate": (len(wins) / len(closed) * 100) if closed else 0.0,
        "totalTrades": len(closed),
        "avgWin": 0.0,
        "avgLoss": 0.0,
        "profitFactor": 0.0,
        "bestDay": 0.0,
        "worstDay": 0.0,
    }
