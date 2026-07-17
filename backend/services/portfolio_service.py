"""Trader portfolio service — live open positions with provider-aware pricing.

Fetches open bets for a trader, refreshes real-time probabilities from the
correct feed (LMSR / Polymarket / Kalshi / Alpaca-backed S&P 500), and
returns mark-to-market P&L. Quote refreshes are TTL-cached to keep the
dashboard endpoint cheap under polling.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.runtime.serializers import (
    serialize_account,
    serialize_portfolio_summary,
    serialize_position,
)
from app.runtime.store import TraderSession, TradingStore, get_trading_store
from integrations.kalshi import KalshiError, get_kalshi_service
from integrations.polymarket import PolymarketError, get_polymarket_service
from services.sp500_market_generator import implied_yes_price

logger = logging.getLogger(__name__)

# Short TTL keeps dashboard polling fast while still picking up live ticks.
_QUOTE_CACHE_TTL_SECONDS = 2.0
_SUMMARY_CACHE_TTL_SECONDS = 1.0


class PortfolioService:
    """Live portfolio reads for a trader session."""

    def __init__(
        self,
        store: TradingStore | None = None,
        *,
        quote_ttl_seconds: float = _QUOTE_CACHE_TTL_SECONDS,
    ) -> None:
        self._store = store or get_trading_store()
        self._quote_ttl = max(0.25, float(quote_ttl_seconds))
        # market_id → (expires_at_monotonic, market_payload)
        self._quote_cache: dict[str, tuple[float, dict[str, Any]]] = {}
        # (tenant_slug, trader_id) → (expires_at, summary_dict)
        self._summary_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}

    def _resolve_session(
        self,
        trader_id: str,
        *,
        tenant_slug: str | None = None,
        session: TraderSession | None = None,
    ) -> TraderSession:
        if session is not None:
            return session
        matches = [
            s
            for s in self._store.iter_sessions()
            if s.user_id == str(trader_id)
            and (tenant_slug is None or s.tenant_slug == tenant_slug)
        ]
        if not matches:
            raise LookupError(f"No trading session for trader_id={trader_id!r}")
        return matches[0]

    def _cache_get(self, market_id: str) -> dict[str, Any] | None:
        entry = self._quote_cache.get(market_id)
        if entry is None:
            return None
        expires_at, payload = entry
        if time.monotonic() >= expires_at:
            self._quote_cache.pop(market_id, None)
            return None
        return payload

    def _cache_set(self, market_id: str, payload: dict[str, Any]) -> None:
        self._quote_cache[market_id] = (time.monotonic() + self._quote_ttl, payload)

    async def _refresh_kalshi(self, market_id: str) -> dict[str, Any] | None:
        cached = self._cache_get(market_id)
        if cached is not None:
            return cached
        try:
            market = await get_kalshi_service().get_market_by_id(market_id, refresh=True)
        except KalshiError as exc:
            logger.debug("Kalshi quote refresh failed for %s: %s", market_id, exc)
            return None
        if market is not None:
            self._cache_set(market_id, market)
        return market

    async def _refresh_polymarket(self, market_id: str) -> dict[str, Any] | None:
        cached = self._cache_get(market_id)
        if cached is not None:
            return cached
        try:
            market = await get_polymarket_service().get_market_by_id(market_id)
        except PolymarketError as exc:
            logger.debug("Polymarket quote refresh failed for %s: %s", market_id, exc)
            return None
        if market is not None:
            self._cache_set(market_id, market)
        return market

    async def _apply_alpaca_sp500_prices(self, session: TraderSession) -> None:
        """Reprice S&P 500 position markets from Alpaca last prints when available."""
        try:
            from services.alpaca_quote_bridge import get_alpaca_quote_bridge

            bridge = get_alpaca_quote_bridge()
        except Exception:  # noqa: BLE001
            return

        tickers: set[str] = set()
        for pos in session.bankroll.positions():
            if not pos.market_id.lower().startswith("sp500-"):
                continue
            runtime = self._store.get_market(pos.market_id)
            ticker = getattr(runtime, "stock_ticker", None) if runtime else None
            if not ticker:
                parts = pos.market_id.split("-")
                ticker = parts[1] if len(parts) > 1 else None
            if ticker:
                tickers.add(str(ticker).upper())

        for ticker in tickers:
            try:
                await bridge.touch_ticker(ticker)
            except Exception:  # noqa: BLE001
                logger.debug("Alpaca touch_ticker failed for %s", ticker, exc_info=True)

        last_prices = bridge.get_last_prices(tickers) if tickers else {}
        if not last_prices:
            return

        for pos in session.bankroll.positions():
            if not pos.market_id.lower().startswith("sp500-"):
                continue
            runtime = self._store.get_market(pos.market_id)
            if runtime is None or runtime.strike_price is None:
                continue
            ticker = (runtime.stock_ticker or "").upper()
            spot = last_prices.get(ticker)
            if spot is None:
                continue
            yes = implied_yes_price(float(spot), float(runtime.strike_price))
            self._store.apply_price_tick(pos.market_id, yes)
            session.external_markets[pos.market_id] = {
                **session.external_markets.get(pos.market_id, {}),
                "id": pos.market_id,
                "question": runtime.question,
                "category": runtime.category,
                "yesPrice": yes,
                "source": "sp500_dynamic",
                "provider": "sp500_dynamic",
                "stockTicker": ticker,
                "strikePrice": runtime.strike_price,
                "expirationType": runtime.expiration_type,
                "expirationDate": runtime.expiration_date,
                "underlyingLast": spot,
            }

    async def refresh_live_prices(self, session: TraderSession) -> None:
        """Refresh cached quotes for open positions from the right provider."""
        market_ids = {pos.market_id for pos in session.bankroll.positions()}
        for ticker in session.kalshi_market_tickers:
            market_ids.add(f"kalshi-{ticker.upper()}")

        tasks: list[asyncio.Task[dict[str, Any] | None]] = []
        task_ids: list[str] = []
        for market_id in market_ids:
            lower = market_id.lower()
            if lower.startswith("kalshi-"):
                tasks.append(asyncio.create_task(self._refresh_kalshi(market_id)))
                task_ids.append(market_id)
            elif lower.startswith("poly-"):
                tasks.append(asyncio.create_task(self._refresh_polymarket(market_id)))
                task_ids.append(market_id)

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for market_id, result in zip(task_ids, results, strict=False):
                if isinstance(result, Exception) or result is None:
                    continue
                session.external_markets[market_id] = result

        await self._apply_alpaca_sp500_prices(session)

    def _position_to_live_event(self, position: dict[str, Any]) -> dict[str, Any]:
        market = position.get("market") or {}
        yes = float(market.get("yesPrice") or position.get("currentPrice") or 0.5)
        source = str(market.get("source") or market.get("provider") or "internal")
        return {
            "id": market.get("id") or position.get("marketId"),
            "externalId": market.get("externalConditionId")
            or market.get("externalTicker")
            or market.get("id")
            or position.get("marketId"),
            "source": source,
            "provider": source,
            "category": market.get("category") or "stocks",
            "status": market.get("status") or "open",
            "question": market.get("question") or position.get("marketId"),
            "probabilities": {"yes": yes, "no": 1.0 - yes},
            "yesPrice": yes,
            "volume": market.get("volume") or 0,
            "volume24h": market.get("volume24h") or 0,
            "change24h": market.get("change24h") or 0,
            "lastUpdated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "stockTicker": market.get("stockTicker"),
            "strikePrice": market.get("strikePrice"),
            "expirationType": market.get("expirationType"),
            "expirationDate": market.get("expirationDate"),
            "positionId": position.get("id"),
            "outcome": position.get("outcome"),
            "shares": position.get("shares"),
            "unrealizedPnl": position.get("pnl"),
        }

    async def get_live_positions(
        self,
        trader_id: str,
        *,
        tenant_slug: str | None = None,
        session: TraderSession | None = None,
        refresh: bool = True,
    ) -> list[dict[str, Any]]:
        """Return open bets marked to live provider prices."""
        resolved = self._resolve_session(trader_id, tenant_slug=tenant_slug, session=session)
        if refresh:
            await self.refresh_live_prices(resolved)
            # Position set / marks changed — drop stale summary snapshots.
            self._summary_cache.pop((resolved.tenant_slug, str(trader_id)), None)
        self._store.sync_session_risk(resolved)
        positions = serialize_position(resolved, self._store)
        # Ensure provider alias is always present for the dashboard filters.
        for pos in positions:
            market = pos.get("market") or {}
            if "provider" not in market:
                market["provider"] = market.get("source", "internal")
            pos["market"] = market
            pos["provider"] = market.get("source") or market.get("provider") or "internal"
            pos["status"] = market.get("status") or "open"
        return positions

    async def get_portfolio_summary(
        self,
        trader_id: str,
        *,
        tenant_slug: str | None = None,
        session: TraderSession | None = None,
        refresh: bool = True,
        positions: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Return total value, total P&L, and open-position count."""
        resolved = self._resolve_session(trader_id, tenant_slug=tenant_slug, session=session)
        cache_key = (resolved.tenant_slug, str(trader_id))
        if not refresh and positions is None:
            cached = self._summary_cache.get(cache_key)
            if cached is not None and time.monotonic() < cached[0]:
                return dict(cached[1])

        live_positions = positions
        if live_positions is None:
            live_positions = await self.get_live_positions(
                trader_id,
                tenant_slug=tenant_slug,
                session=resolved,
                refresh=refresh,
            )
        base = serialize_portfolio_summary(resolved, self._store)
        positions_value = sum(float(p.get("value") or 0) for p in live_positions)
        open_pnl = sum(float(p.get("pnl") or 0) for p in live_positions)
        summary = {
            **base,
            "totalValue": round(float(base.get("equity") or 0), 2),
            "positionsValue": round(positions_value, 2),
            "totalPnl": round(float(base.get("totalPnl") or 0), 2),
            "openPnl": round(open_pnl, 2),
            "openPositions": len(live_positions),
            "numberOfOpenPositions": len(live_positions),
        }
        self._summary_cache[cache_key] = (
            time.monotonic() + _SUMMARY_CACHE_TTL_SECONDS,
            summary,
        )
        return summary

    async def get_trader_portfolio(
        self,
        trader_id: str,
        *,
        tenant_slug: str | None = None,
        session: TraderSession | None = None,
    ) -> dict[str, Any]:
        """Full dashboard payload: account, positions, summary, live events."""
        resolved = self._resolve_session(trader_id, tenant_slug=tenant_slug, session=session)
        positions = await self.get_live_positions(
            trader_id,
            tenant_slug=tenant_slug,
            session=resolved,
            refresh=True,
        )
        summary = await self.get_portfolio_summary(
            trader_id,
            tenant_slug=tenant_slug,
            session=resolved,
            refresh=False,
            positions=positions,
        )
        events = [self._position_to_live_event(pos) for pos in positions]
        return {
            "account": serialize_account(resolved, self._store),
            "positions": positions,
            "summary": summary,
            "events": events,
            "traderId": str(trader_id),
        }


_portfolio_service: PortfolioService | None = None


def get_portfolio_service() -> PortfolioService:
    global _portfolio_service
    if _portfolio_service is None:
        _portfolio_service = PortfolioService()
    return _portfolio_service


async def get_live_positions(
    trader_id: str,
    *,
    tenant_slug: str | None = None,
    session: TraderSession | None = None,
) -> list[dict[str, Any]]:
    return await get_portfolio_service().get_live_positions(
        trader_id, tenant_slug=tenant_slug, session=session
    )


async def get_portfolio_summary(
    trader_id: str,
    *,
    tenant_slug: str | None = None,
    session: TraderSession | None = None,
) -> dict[str, Any]:
    return await get_portfolio_service().get_portfolio_summary(
        trader_id, tenant_slug=tenant_slug, session=session
    )
