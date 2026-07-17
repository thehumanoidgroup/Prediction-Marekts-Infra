"""Portfolio WebSocket events — private trader rooms over Redis pub/sub.

Reuses ``ConnectionManager.broadcast`` → ``pp:markets:{tenant}`` so every
API replica delivers frames to sockets subscribed to ``user:{trader_id}``.
"""

from __future__ import annotations

import time
from typing import Any, Literal

from app.ws.manager import manager

PortfolioReason = Literal[
    "order_filled",
    "position_closed",
    "position_updated",
    "mark_to_market",
]


def user_room(user_id: str) -> str:
    """Room key for trader-private portfolio frames."""
    return f"user:{user_id}"


def _envelope(
    message_type: str,
    *,
    user_id: str,
    reason: PortfolioReason,
    data: dict[str, Any],
    market_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": message_type,
        "reason": reason,
        "user_id": str(user_id),
        "data": data,
        "ts": int(time.time() * 1000),
    }
    if market_id:
        payload["market_id"] = market_id
    return payload


async def broadcast_new_position(
    tenant_slug: str,
    *,
    user_id: str,
    position: dict[str, Any],
    order: dict[str, Any] | None = None,
    summary: dict[str, Any] | None = None,
    reason: PortfolioReason = "order_filled",
) -> None:
    """Push a newly opened (or increased) position to the trader's sockets."""
    data: dict[str, Any] = {"position": position}
    if order is not None:
        data["order"] = order
    if summary is not None:
        data["summary"] = summary

    await manager.broadcast(
        tenant_slug,
        _envelope(
            "new_position",
            user_id=user_id,
            reason=reason,
            data=data,
            market_id=str(position.get("marketId") or position.get("market_id") or ""),
        ),
        rooms=[user_room(user_id), "all"],
    )


async def broadcast_portfolio_update(
    tenant_slug: str,
    *,
    user_id: str,
    reason: PortfolioReason,
    position: dict[str, Any] | None = None,
    order: dict[str, Any] | None = None,
    summary: dict[str, Any] | None = None,
    market_id: str | None = None,
    positions: list[dict[str, Any]] | None = None,
) -> None:
    """Push portfolio mutations (close, resize, mark-to-market, etc.)."""
    data: dict[str, Any] = {}
    if position is not None:
        data["position"] = position
    if order is not None:
        data["order"] = order
    if summary is not None:
        data["summary"] = summary
    if positions is not None:
        data["positions"] = positions

    resolved_market = market_id
    if not resolved_market and position:
        resolved_market = str(position.get("marketId") or position.get("market_id") or "") or None

    await manager.broadcast(
        tenant_slug,
        _envelope(
            "portfolio_update",
            user_id=user_id,
            reason=reason,
            data=data,
            market_id=resolved_market,
        ),
        rooms=[user_room(user_id), "all"],
    )


async def broadcast_position_marks(
    tenant_slug: str,
    *,
    user_id: str,
    positions: list[dict[str, Any]],
    summary: dict[str, Any] | None = None,
) -> None:
    """Push live P&L / probability marks for open positions."""
    await broadcast_portfolio_update(
        tenant_slug,
        user_id=user_id,
        reason="mark_to_market",
        positions=positions,
        summary=summary,
    )
