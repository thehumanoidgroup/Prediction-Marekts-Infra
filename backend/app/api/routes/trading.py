"""Trader-facing REST endpoints — portfolio, markets, orders, journal."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import get_current_tenant, get_trader_session
from app.models import Tenant
from app.runtime.hybrid_markets import get_hybrid_market, list_hybrid_markets
from app.runtime.serializers import (
    serialize_account,
    serialize_journal,
    serialize_market,
    serialize_portfolio_summary,
    serialize_position,
)
from app.runtime.store import TraderSession, get_trading_store
from app.ws.manager import manager
from integrations.kalshi import KalshiError, get_kalshi_service
from integrations.polymarket import PolymarketError

router = APIRouter(prefix="/trading", tags=["trading"])

MarketListingSource = Literal["internal", "polymarket", "kalshi", "all"]


class PlaceOrderBody(BaseModel):
    market_id: str = Field(alias="marketId")
    outcome: Literal["yes", "no"]
    side: Literal["buy", "sell"]
    shares: int = Field(gt=0)

    model_config = {"populate_by_name": True}


class JournalNoteBody(BaseModel):
    note: str = Field(min_length=1, max_length=2000)
    tags: list[str] = Field(default_factory=list)


def _kalshi_ticker_allowed(session: TraderSession, market_id: str) -> bool:
    if not session.kalshi_market_tickers:
        return True
    ticker = market_id.removeprefix("kalshi-").removeprefix("KALSHI-").upper()
    return ticker in {t.upper() for t in session.kalshi_market_tickers}


async def _refresh_session_external_prices(session: TraderSession) -> None:
    """Refresh cached external quotes for open positions and Kalshi allowlist."""
    market_ids: set[str] = {pos.market_id for pos in session.bankroll.positions()}
    for ticker in session.kalshi_market_tickers:
        market_ids.add(f"kalshi-{ticker.upper()}")

    service = get_kalshi_service()
    for market_id in market_ids:
        if not market_id.lower().startswith("kalshi-"):
            continue
        try:
            market = await service.get_market_by_id(market_id, refresh=True)
        except KalshiError:
            continue
        if market is not None:
            session.external_markets[market_id] = market


@router.get("/markets")
async def list_markets(
    session: Annotated[TraderSession, Depends(get_trader_session)],
    category: str = Query("all"),
    q: str = Query(""),
    sort: str = Query("volume"),
    source: MarketListingSource = Query(
        "all",
        description="Market feed: internal LMSR, polymarket, kalshi, or all (hybrid)",
    ),
) -> dict:
    tickers = session.kalshi_market_tickers if session else None
    try:
        return await list_hybrid_markets(
            category=category,
            query=q,
            sort=sort,
            source=source,
            kalshi_tickers=tickers,
        )
    except (PolymarketError, KalshiError) as exc:
        raise HTTPException(502, detail=str(exc)) from exc


@router.get("/markets/{market_id}")
async def get_market(market_id: str) -> dict:
    market = await get_hybrid_market(market_id)
    if market is None:
        raise HTTPException(404, detail="Market not found")
    return {"market": market}


@router.get("/portfolio")
async def get_portfolio(
    session: Annotated[TraderSession, Depends(get_trader_session)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> dict:
    if session.provider == "kalshi":
        await _refresh_session_external_prices(session)
    store = get_trading_store()
    return {
        "account": serialize_account(session, store),
        "positions": serialize_position(session, store),
        "summary": serialize_portfolio_summary(session, store),
    }


@router.post("/orders", status_code=201)
async def place_order(
    body: PlaceOrderBody,
    session: Annotated[TraderSession, Depends(get_trader_session)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> dict:
    store = get_trading_store()
    market_id = body.market_id

    try:
        if market_id.lower().startswith("kalshi-"):
            if session.kalshi_market_tickers and not _kalshi_ticker_allowed(session, market_id):
                raise HTTPException(403, detail="Kalshi market not in your allowlist")

            market = await get_kalshi_service().get_market_by_id(market_id, refresh=True)
            if market is None:
                raise HTTPException(404, detail="Kalshi market not found")

            result = store.place_external_order(
                session,
                market_id=market_id,
                market_question=str(market.get("question") or market_id),
                outcome=body.outcome,
                side=body.side,
                shares=body.shares,
                yes_price=float(market.get("yesPrice") or 0.5),
                category=str(market.get("category") or "economics"),
            )
        else:
            result = store.place_order(
                session,
                market_id=market_id,
                outcome=body.outcome,
                side=body.side,
                shares=body.shares,
            )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

    await manager.broadcast(
        tenant.slug,
        {
            "type": "portfolio_update",
            "reason": "order_filled",
            "market_id": body.market_id,
            "ts": result["order"]["filledAt"],
        },
    )
    return result


@router.get("/journal")
async def get_journal(
    session: Annotated[TraderSession, Depends(get_trader_session)],
) -> dict:
    return {"journal": [serialize_journal(e) for e in session.journal]}


@router.post("/journal", status_code=201)
async def add_journal_note(
    body: JournalNoteBody,
    session: Annotated[TraderSession, Depends(get_trader_session)],
) -> dict:
    entry = get_trading_store().add_note(session, body.note.strip(), body.tags)
    return {"entry": serialize_journal(entry)}
