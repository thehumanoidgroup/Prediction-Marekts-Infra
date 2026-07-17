"""Trader portfolio API — live open positions and mark-to-market summary."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_tenant, get_trader_session, get_trader_user
from app.models import Tenant, User
from app.runtime.store import TraderSession
from services.portfolio_service import get_portfolio_service

router = APIRouter(prefix="/trader", tags=["trader"])


@router.get("/portfolio")
async def get_trader_portfolio(
    session: Annotated[TraderSession, Depends(get_trader_session)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_trader_user)],
) -> dict:
    """Live open positions + portfolio summary for the authenticated trader.

    Prices are refreshed from the correct provider (Alpaca for S&P 500,
    Kalshi / Polymarket feeds for external markets, LMSR for internal) and
    TTL-cached inside ``PortfolioService``.
    """
    service = get_portfolio_service()
    try:
        return await service.get_trader_portfolio(
            str(user.id),
            tenant_slug=tenant.slug,
            session=session,
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/portfolio/positions")
async def get_trader_live_positions(
    session: Annotated[TraderSession, Depends(get_trader_session)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_trader_user)],
) -> dict:
    """Open positions only (live marks)."""
    service = get_portfolio_service()
    positions = await service.get_live_positions(
        str(user.id),
        tenant_slug=tenant.slug,
        session=session,
    )
    return {"positions": positions, "count": len(positions), "traderId": str(user.id)}


@router.get("/portfolio/summary")
async def get_trader_portfolio_summary(
    session: Annotated[TraderSession, Depends(get_trader_session)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_trader_user)],
) -> dict:
    """Compact portfolio totals for the trader dashboard header."""
    service = get_portfolio_service()
    summary = await service.get_portfolio_summary(
        str(user.id),
        tenant_slug=tenant.slug,
        session=session,
    )
    return {"summary": summary, "traderId": str(user.id)}
