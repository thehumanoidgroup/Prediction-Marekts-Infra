"""Hybrid market listing — merges internal LMSR, Polymarket, Kalshi, and S&P 500 feeds."""

from __future__ import annotations

from typing import Any, Literal

from integrations.kalshi import KalshiError, get_kalshi_service
from integrations.polymarket import PolymarketError, get_polymarket_service

from app.runtime.serializers import serialize_market
from app.runtime.store import get_trading_store

MarketSource = Literal["internal", "polymarket", "kalshi", "sp500_dynamic", "all"]
MarketSort = Literal["volume", "newest", "closing", "movers"]


def _filter_markets(
    markets: list[dict[str, Any]],
    *,
    category: str,
    query: str,
) -> list[dict[str, Any]]:
    result = markets

    if category and category != "all":
        result = [market for market in result if market.get("category") == category]

    needle = query.strip().lower()
    if needle:
        result = [
            market
            for market in result
            if needle in str(market.get("question", "")).lower()
            or needle in str(market.get("marketSlug") or "").lower()
            or needle in str(market.get("category", "")).lower()
            or needle in str(market.get("externalTicker") or "").lower()
            or needle in str(market.get("stockTicker") or "").lower()
        ]

    return result


def _filter_kalshi_allowlist(
    markets: list[dict[str, Any]],
    tickers: list[str] | None,
) -> list[dict[str, Any]]:
    if not tickers:
        return markets
    allowed = {ticker.upper() for ticker in tickers}
    return [
        market
        for market in markets
        if str(market.get("externalTicker") or "").upper() in allowed
        or str(market.get("id", "")).upper().replace("KALSHI-", "") in allowed
    ]


def _filter_sp500_allowlist(
    markets: list[dict[str, Any]],
    tickers: list[str] | None,
) -> list[dict[str, Any]]:
    if not tickers:
        return markets
    allowed = {ticker.upper() for ticker in tickers}
    return [
        market
        for market in markets
        if str(market.get("stockTicker") or "").upper() in allowed
    ]


def _sort_markets(markets: list[dict[str, Any]], sort: MarketSort) -> list[dict[str, Any]]:
    sorted_markets = list(markets)

    if sort == "movers":
        sorted_markets.sort(
            key=lambda market: abs(float(market.get("change24h") or 0.0)),
            reverse=True,
        )
    elif sort == "closing":
        sorted_markets.sort(key=lambda market: int(market.get("closesAt") or 0))
    elif sort == "newest":
        sorted_markets.sort(key=lambda market: int(market.get("closesAt") or 0), reverse=True)
    else:
        sorted_markets.sort(
            key=lambda market: float(market.get("volume24h") or market.get("volume") or 0.0),
            reverse=True,
        )

    return sorted_markets


def _count_by_source(markets: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"internal": 0, "polymarket": 0, "kalshi": 0, "sp500_dynamic": 0}
    for market in markets:
        src = market.get("source", "internal")
        if src in counts:
            counts[src] += 1
    return counts


async def _load_polymarket_markets(query: str) -> list[dict[str, Any]]:
    service = get_polymarket_service()
    if query.strip():
        return await service.search_markets(query.strip())
    return await service.get_all_markets()


async def _load_kalshi_markets(
    query: str,
    *,
    tickers: list[str] | None = None,
) -> list[dict[str, Any]]:
    service = get_kalshi_service()
    if query.strip():
        markets = await service.search_markets(query.strip())
    else:
        markets = await service.get_active_markets()
    return _filter_kalshi_allowlist(markets, tickers)


def _load_sp500_markets(
    *,
    category: str = "all",
    query: str = "",
    sort: MarketSort = "volume",
    tickers: list[str] | None = None,
) -> list[dict[str, Any]]:
    store = get_trading_store()
    markets = [
        serialize_market(market)
        for market in store.list_markets(category="all", query="", sort="volume")
        if getattr(market, "source", "internal") == "sp500_dynamic"
    ]
    markets = _filter_sp500_allowlist(markets, tickers)
    markets = _filter_markets(markets, category=category, query=query)
    return _sort_markets(markets, sort)


async def list_hybrid_markets(
    *,
    category: str = "all",
    query: str = "",
    sort: MarketSort = "volume",
    source: MarketSource = "all",
    kalshi_tickers: list[str] | None = None,
    sp500_tickers: list[str] | None = None,
) -> dict[str, Any]:
    """Return normalized markets from internal, Polymarket, Kalshi, S&P 500, or combined."""
    store = get_trading_store()

    if source == "internal":
        runtime_markets = store.list_markets(category=category, query=query, sort=sort)
        markets = [
            serialize_market(market)
            for market in runtime_markets
            if getattr(market, "source", "internal") not in {"kalshi", "sp500_dynamic"}
        ]
        return {
            "markets": markets,
            "source": source,
            "counts": _count_by_source(markets),
        }

    if source == "polymarket":
        markets = await _load_polymarket_markets(query)
        if not query.strip():
            markets = _filter_markets(markets, category=category, query="")
        elif category != "all":
            markets = [m for m in markets if m.get("category") == category]
        markets = _sort_markets(markets, sort)
        return {
            "markets": markets,
            "source": source,
            "counts": _count_by_source(markets),
        }

    if source == "kalshi":
        try:
            markets = await _load_kalshi_markets(query, tickers=kalshi_tickers)
        except KalshiError:
            markets = []
        if not query.strip():
            markets = _filter_markets(markets, category=category, query="")
        elif category != "all":
            markets = [m for m in markets if m.get("category") == category]
        markets = _sort_markets(markets, sort)
        return {
            "markets": markets,
            "source": source,
            "counts": _count_by_source(markets),
        }

    if source == "sp500_dynamic":
        markets = _load_sp500_markets(
            category=category,
            query=query,
            sort=sort,
            tickers=sp500_tickers,
        )
        return {
            "markets": markets,
            "source": source,
            "counts": _count_by_source(markets),
        }

    # Hybrid: merge internal LMSR + Polymarket + Kalshi + S&P 500 listings.
    markets: list[dict[str, Any]] = []
    markets.extend(
        serialize_market(market)
        for market in store.list_markets(category="all", query="", sort="volume")
        if getattr(market, "source", "internal") not in {"kalshi", "sp500_dynamic"}
    )
    try:
        markets.extend(await _load_polymarket_markets(query))
    except PolymarketError:
        pass
    try:
        markets.extend(await _load_kalshi_markets(query, tickers=kalshi_tickers))
    except KalshiError:
        pass
    markets.extend(
        _load_sp500_markets(
            category="all",
            query="",
            sort="volume",
            tickers=sp500_tickers,
        )
    )

    markets = _filter_markets(markets, category=category, query=query)
    markets = _sort_markets(markets, sort)

    return {
        "markets": markets,
        "source": source,
        "counts": _count_by_source(markets),
    }


async def get_hybrid_market(market_id: str) -> dict[str, Any] | None:
    """Resolve a market from internal runtime, Polymarket, Kalshi, or S&P 500 by id."""
    if market_id.startswith("poly-"):
        service = get_polymarket_service()
        try:
            return await service.get_market_by_id(market_id)
        except PolymarketError:
            return None

    if market_id.lower().startswith("kalshi-"):
        service = get_kalshi_service()
        try:
            return await service.get_market_by_id(market_id)
        except KalshiError:
            return None

    if market_id.lower().startswith("sp500-"):
        runtime = get_trading_store().get_market(market_id)
        if runtime is None:
            return None
        return serialize_market(runtime)

    runtime = get_trading_store().get_market(market_id)
    if runtime is None:
        return None
    return serialize_market(runtime)
