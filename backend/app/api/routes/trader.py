"""Trader portfolio API — live open positions and mark-to-market summary."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_tenant, get_trader_session, get_trader_user
from app.models import Tenant, User
from app.runtime.store import TraderSession
from realtime.portfolio_events import broadcast_new_position, broadcast_portfolio_update
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


class PortfolioNotifyBody(BaseModel):
    """Bridge for Next.js order fills → FastAPI WebSocket fan-out."""

    event_type: Literal["new_position", "portfolio_update"] = Field(
        default="new_position",
        alias="eventType",
    )
    reason: Literal[
        "order_filled",
        "position_closed",
        "position_updated",
        "mark_to_market",
    ] = "order_filled"
    position: dict[str, Any] | None = None
    order: dict[str, Any] | None = None
    summary: dict[str, Any] | None = None
    market_id: str | None = Field(default=None, alias="marketId")
    positions: list[dict[str, Any]] | None = None

    model_config = {"populate_by_name": True}


@router.post("/portfolio/events", status_code=202)
async def notify_portfolio_event(
    body: PortfolioNotifyBody,
    session: Annotated[TraderSession, Depends(get_trader_session)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_trader_user)],
) -> dict:
    """Accept a portfolio mutation from the Next.js BFF and broadcast over WS/Redis."""
    user_id = str(user.id)
    if body.event_type == "new_position":
        if not body.position:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="position required")
        await broadcast_new_position(
            tenant.slug,
            user_id=user_id,
            position=body.position,
            order=body.order,
            summary=body.summary,
            reason=body.reason if body.reason != "mark_to_market" else "order_filled",
        )
    else:
        await broadcast_portfolio_update(
            tenant.slug,
            user_id=user_id,
            reason=body.reason,
            position=body.position,
            order=body.order,
            summary=body.summary,
            market_id=body.market_id,
            positions=body.positions,
        )
    return {"ok": True, "traderId": user_id, "tenant": tenant.slug}
