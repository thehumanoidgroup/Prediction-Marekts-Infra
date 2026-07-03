"""REST endpoints for Polymarket market discovery (read-only)."""

from __future__ import annotations

import math
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query

from integrations.polymarket import PolymarketError, get_polymarket_service

router = APIRouter(prefix="/polymarket", tags=["polymarket"])

MarketStatus = Literal["open", "closing_soon", "resolved"]
MarketSort = Literal["volume", "closing", "newest", "movers"]


def _apply_filters(
    markets: list[dict[str, Any]],
    *,
    category: str,
    status: str | None,
    active_only: bool,
) -> list[dict[str, Any]]:
    result = markets

    if category and category != "all":
        result = [market for market in result if market.get("category") == category]

    if status:
        result = [market for market in result if market.get("status") == status]

    if active_only:
        result = [
            market
            for market in result
            if market.get("acceptingOrders")
            and market.get("status") in {"open", "closing_soon"}
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


def _paginate(
    markets: list[dict[str, Any]],
    *,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    total = len(markets)
    total_pages = max(1, math.ceil(total / page_size)) if total else 0
    safe_page = min(max(page, 1), total_pages) if total_pages else 1
    start = (safe_page - 1) * page_size
    end = start + page_size

    return {
        "markets": markets[start:end],
        "pagination": {
            "page": safe_page,
            "pageSize": page_size,
            "total": total,
            "totalPages": total_pages,
            "hasNext": safe_page < total_pages,
            "hasPrev": safe_page > 1 and total_pages > 0,
        },
    }


async def _load_markets(*, active_only: bool, refresh: bool) -> list[dict[str, Any]]:
    service = get_polymarket_service()
    if active_only:
        return await service.get_active_markets(refresh=refresh)
    return await service.get_all_markets(refresh=refresh)


@router.get("/markets")
async def list_polymarket_markets(
    category: str = Query("all", description="Market category filter"),
    status: MarketStatus | None = Query(None, description="Market status filter"),
    active: bool = Query(False, description="Return only open, order-accepting markets"),
    sort: MarketSort = Query("volume", description="Sort order"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize", description="Items per page"),
    refresh: bool = Query(False, description="Bypass cache and refetch from Polymarket"),
) -> dict:
    """List normalized Polymarket markets with pagination and filters."""
    try:
        markets = await _load_markets(active_only=active, refresh=refresh)
        markets = _apply_filters(markets, category=category, status=status, active_only=False)
        markets = _sort_markets(markets, sort)
        return _paginate(markets, page=page, page_size=page_size)
    except PolymarketError as exc:
        raise HTTPException(502, detail=str(exc)) from exc


@router.get("/markets/{market_id}")
async def get_polymarket_market(market_id: str) -> dict:
    """Fetch a single normalized Polymarket market by id or condition id."""
    service = get_polymarket_service()
    try:
        market = await service.get_market_by_id(market_id)
    except PolymarketError as exc:
        raise HTTPException(502, detail=str(exc)) from exc

    if market is None:
        raise HTTPException(404, detail="Polymarket market not found")
    return {"market": market}


@router.get("/search")
async def search_polymarket_markets(
    q: str = Query(..., min_length=1, description="Search query"),
    category: str = Query("all", description="Market category filter"),
    status: MarketStatus | None = Query(None, description="Market status filter"),
    active: bool = Query(False, description="Return only open, order-accepting markets"),
    sort: MarketSort = Query("volume", description="Sort order"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize", description="Items per page"),
    refresh: bool = Query(False, description="Bypass cache and refetch from Polymarket"),
) -> dict:
    """Search Polymarket markets by question, slug, category, or outcomes."""
    service = get_polymarket_service()
    try:
        markets = await service.search_markets(q.strip(), refresh=refresh)
        markets = _apply_filters(
            markets,
            category=category,
            status=status,
            active_only=active,
        )
        markets = _sort_markets(markets, sort)
        payload = _paginate(markets, page=page, page_size=page_size)
        payload["query"] = q.strip()
        return payload
    except PolymarketError as exc:
        raise HTTPException(502, detail=str(exc)) from exc
