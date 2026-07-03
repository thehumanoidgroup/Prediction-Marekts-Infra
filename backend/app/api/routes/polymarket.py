"""REST endpoints for Polymarket market discovery (read-only)."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from integrations.polymarket import PolymarketError, get_polymarket_service

router = APIRouter(prefix="/polymarket", tags=["polymarket"])


@router.get("/markets")
async def list_polymarket_markets(
    q: str = Query("", description="Search query"),
    active: bool = Query(False, description="Return only open, order-accepting markets"),
    refresh: bool = Query(False, description="Bypass cache and refetch from Polymarket"),
) -> dict:
    """List normalized Polymarket markets for display alongside internal LMSR markets."""
    service = get_polymarket_service()
    try:
        if q.strip():
            markets = await service.search_markets(q.strip(), refresh=refresh)
        elif active:
            markets = await service.get_active_markets(refresh=refresh)
        else:
            markets = await service.get_all_markets(refresh=refresh)
    except PolymarketError as exc:
        raise HTTPException(502, detail=str(exc)) from exc

    return {"markets": markets}


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
