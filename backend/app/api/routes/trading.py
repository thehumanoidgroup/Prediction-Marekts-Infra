"""Trader-facing REST endpoints — portfolio, markets, orders, journal."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import get_current_tenant, get_trader_session
from app.models import Tenant
from app.runtime.hybrid_markets import get_hybrid_market, list_hybrid_markets
from app.runtime.serializers import (
    serialize_journal,
)
from app.runtime.store import TraderSession, get_trading_store
from integrations.kalshi import KalshiError, get_kalshi_service
from integrations.polymarket import PolymarketError

router = APIRouter(prefix="/trading", tags=["trading"])

MarketListingSource = Literal["internal", "polymarket", "kalshi", "sp500_dynamic", "all"]


class PlaceOrderBody(BaseModel):
    market_id: str = Field(alias="marketId")
    outcome: Literal["yes", "no"]
    side: Literal["buy", "sell"]
    shares: int = Field(gt=0)

    model_config = {"populate_by_name": True}


class PreviewOrderBody(BaseModel):
    market_id: str = Field(alias="marketId")
    outcome: Literal["yes", "no"]
    side: Literal["buy", "sell"] = "buy"
    shares: int = Field(gt=0)
    yes_price: float | None = Field(default=None, alias="yesPrice", gt=0, lt=1)

    model_config = {"populate_by_name": True}


class JournalNoteBody(BaseModel):
    note: str = Field(min_length=1, max_length=2000)
    tags: list[str] = Field(default_factory=list)


def _kalshi_ticker_allowed(session: TraderSession, market_id: str) -> bool:
    if not session.kalshi_market_tickers:
        return True
    ticker = market_id.removeprefix("kalshi-").removeprefix("KALSHI-").upper()
    return ticker in {t.upper() for t in session.kalshi_market_tickers}


def _sp500_ticker_allowed(session: TraderSession, market_id: str) -> bool:
    """Allowlist by underlying equity ticker embedded in sp500-{TICKER}-… ids."""
    if not session.sp500_tickers:
        return True
    parts = market_id.split("-")
    if len(parts) < 2 or parts[0].lower() != "sp500":
        return False
    ticker = parts[1].upper()
    return ticker in {t.upper() for t in session.sp500_tickers}

@router.get("/markets")
async def list_markets(
    session: Annotated[TraderSession, Depends(get_trader_session)],
    category: str = Query("all"),
    q: str = Query(""),
    sort: str = Query("volume"),
    source: MarketListingSource = Query(
        "all",
        description="Market feed: internal, polymarket, kalshi, sp500_dynamic, or all",
    ),
) -> dict:
    tickers = session.kalshi_market_tickers if session else None
    sp500 = session.sp500_tickers if session else None
    try:
        return await list_hybrid_markets(
            category=category,
            query=q,
            sort=sort,
            source=source,
            kalshi_tickers=tickers,
            sp500_tickers=sp500,
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
    """Legacy trading portfolio — delegates to PortfolioService for live marks."""
    from services.portfolio_service import get_portfolio_service

    payload = await get_portfolio_service().get_trader_portfolio(
        session.user_id,
        tenant_slug=tenant.slug,
        session=session,
    )
    return {
        "account": payload["account"],
        "positions": payload["positions"],
        "summary": payload["summary"],
    }


@router.post("/orders/preview")
async def preview_order(
    body: PreviewOrderBody,
    session: Annotated[TraderSession, Depends(get_trader_session)],
) -> dict:
    """Pre-trade risk check — same rules as order placement."""
    store = get_trading_store()
    market_id = body.market_id
    yes_price = body.yes_price

    if market_id.lower().startswith("kalshi-"):
        if session.kalshi_market_tickers and not _kalshi_ticker_allowed(session, market_id):
            raise HTTPException(403, detail="Kalshi market not in your allowlist")
        if yes_price is None:
            market = await get_kalshi_service().get_market_by_id(market_id, refresh=True)
            if market is None:
                raise HTTPException(404, detail="Kalshi market not found")
            yes_price = float(market.get("yesPrice") or 0.5)
    elif market_id.lower().startswith("sp500-"):
        if session.sp500_tickers and not _sp500_ticker_allowed(session, market_id):
            raise HTTPException(403, detail="S&P 500 ticker not in your allowlist")
        if yes_price is None:
            market = await get_hybrid_market(market_id)
            if market is None:
                raise HTTPException(404, detail="S&P 500 market not found")
            yes_price = float(market.get("yesPrice") or 0.5)

    preview = store.preview_order_risk(
        session,
        market_id=market_id,
        outcome=body.outcome,
        side=body.side,
        shares=body.shares,
        yes_price=yes_price,
    )
    return {"preview": preview}


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
        elif market_id.lower().startswith("poly-") or market_id.lower().startswith("0x"):
            market = await get_hybrid_market(market_id)
            if market is None:
                raise HTTPException(404, detail="Polymarket market not found")

            result = store.place_external_order(
                session,
                market_id=market_id,
                market_question=str(market.get("question") or market_id),
                outcome=body.outcome,
                side=body.side,
                shares=body.shares,
                yes_price=float(market.get("yesPrice") or 0.5),
                category=str(market.get("category") or "politics"),
            )
        elif market_id.lower().startswith("sp500-"):
            if session.sp500_tickers and not _sp500_ticker_allowed(session, market_id):
                raise HTTPException(403, detail="S&P 500 ticker not in your allowlist")

            market = await get_hybrid_market(market_id)
            if market is None:
                raise HTTPException(404, detail="S&P 500 market not found")

            # Prefer internal LMSR fill when the market lives in the store;
            # otherwise virtual-fill at the quoted LMSR/seed price.
            runtime = store.get_market(market_id)
            if runtime is not None:
                result = store.place_order(
                    session,
                    market_id=market_id,
                    outcome=body.outcome,
                    side=body.side,
                    shares=body.shares,
                )
            else:
                result = store.place_external_order(
                    session,
                    market_id=market_id,
                    market_question=str(market.get("question") or market_id),
                    outcome=body.outcome,
                    side=body.side,
                    shares=body.shares,
                    yes_price=float(market.get("yesPrice") or 0.5),
                    category=str(market.get("category") or "stocks"),
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

    from realtime.portfolio_events import broadcast_new_position, broadcast_portfolio_update
    from services.portfolio_service import get_portfolio_service

    portfolio = get_portfolio_service()
    live_positions = await portfolio.get_live_positions(
        session.user_id,
        tenant_slug=tenant.slug,
        session=session,
        refresh=False,
    )
    summary = await portfolio.get_portfolio_summary(
        session.user_id,
        tenant_slug=tenant.slug,
        session=session,
        refresh=False,
        positions=live_positions,
    )
    enriched = next(
        (
            pos
            for pos in live_positions
            if pos.get("marketId") == body.market_id and pos.get("outcome") == body.outcome
        ),
        result.get("position"),
    )

    if body.side == "buy" and enriched is not None:
        await broadcast_new_position(
            tenant.slug,
            user_id=session.user_id,
            position=enriched,
            order=result.get("order"),
            summary=summary,
            reason="order_filled",
        )
    else:
        await broadcast_portfolio_update(
            tenant.slug,
            user_id=session.user_id,
            reason="position_closed" if enriched is None else "position_updated",
            position=enriched,
            order=result.get("order"),
            summary=summary,
            market_id=body.market_id,
            positions=live_positions,
        )

    return {**result, "position": enriched, "summary": summary, "positions": live_positions}


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
