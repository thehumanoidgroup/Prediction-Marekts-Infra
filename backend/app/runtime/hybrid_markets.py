"""Hybrid market listing — merges internal LMSR and Polymarket feeds."""

from __future__ import annotations

from typing import Any, Literal

from integrations.polymarket import PolymarketError, get_polymarket_service

from app.runtime.serializers import serialize_market
from app.runtime.store import get_trading_store

MarketSource = Literal["internal", "polymarket", "all"]
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
        ]

    return result


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
    counts = {"internal": 0, "polymarket": 0}
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


async def list_hybrid_markets(
    *,
    category: str = "all",
    query: str = "",
    sort: MarketSort = "volume",
    source: MarketSource = "all",
) -> dict[str, Any]:
    """Return normalized markets from internal, Polymarket, or both sources."""
    store = get_trading_store()

    if source == "internal":
        runtime_markets = store.list_markets(category=category, query=query, sort=sort)
        markets = [serialize_market(market) for market in runtime_markets]
        return {
            "markets": markets,
            "source": source,
            "counts": _count_by_source(markets),
        }

    markets: list[dict[str, Any]] = []

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

    # Hybrid: merge internal LMSR + Polymarket listings.
    markets.extend(
        serialize_market(market)
        for market in store.list_markets(category="all", query="", sort="volume")
    )
    try:
        markets.extend(await _load_polymarket_markets(query))
    except PolymarketError:
        pass

    markets = _filter_markets(markets, category=category, query=query)
    markets = _sort_markets(markets, sort)

    return {
        "markets": markets,
        "source": source,
        "counts": _count_by_source(markets),
    }


async def get_hybrid_market(market_id: str) -> dict[str, Any] | None:
    """Resolve a market from internal runtime or Polymarket by id."""
    if market_id.startswith("poly-"):
        service = get_polymarket_service()
        try:
            return await service.get_market_by_id(market_id)
        except PolymarketError:
            return None

    runtime = get_trading_store().get_market(market_id)
    if runtime is None:
        return None
    return serialize_market(runtime)
