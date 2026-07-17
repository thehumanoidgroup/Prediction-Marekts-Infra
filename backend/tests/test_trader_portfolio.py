"""PortfolioService + GET /api/trader/portfolio tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.runtime.store import get_trading_store
from services.portfolio_service import PortfolioService, get_portfolio_service

HEADERS = {"X-Tenant-Slug": "app"}


def test_trader_portfolio_endpoint(client: TestClient):
    response = client.get("/api/trader/portfolio", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert "account" in body
    assert "positions" in body
    assert "summary" in body
    assert "events" in body
    assert "traderId" in body
    assert body["summary"]["openPositions"] == len(body["positions"])
    assert "totalValue" in body["summary"]
    assert "totalPnl" in body["summary"]


def test_trader_portfolio_after_order(client: TestClient):
    before = client.get("/api/trader/portfolio", headers=HEADERS)
    assert before.status_code == 200

    order = client.post(
        "/api/v1/trading/orders",
        headers=HEADERS,
        json={"marketId": "mkt-1", "outcome": "yes", "side": "buy", "shares": 25},
    )
    assert order.status_code == 201

    after = client.get("/api/trader/portfolio", headers=HEADERS)
    assert after.status_code == 200
    body = after.json()
    assert body["summary"]["openPositions"] >= 1
    assert any(p["marketId"] == "mkt-1" for p in body["positions"])
    assert any(e["id"] == "mkt-1" or e.get("externalId") == "mkt-1" for e in body["events"])
    assert body["summary"]["positionsValue"] > 0


def test_trader_portfolio_summary_endpoint(client: TestClient):
    response = client.get("/api/trader/portfolio/summary", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert "summary" in body
    assert "openPositions" in body["summary"]
    assert "totalValue" in body["summary"]


def test_portfolio_service_methods_match_endpoint(client: TestClient):
    warm = client.get("/api/trader/portfolio", headers=HEADERS)
    assert warm.status_code == 200
    trader_id = warm.json()["traderId"]
    open_count = warm.json()["summary"]["openPositions"]

    positions_res = client.get("/api/trader/portfolio/positions", headers=HEADERS)
    summary_res = client.get("/api/trader/portfolio/summary", headers=HEADERS)
    assert positions_res.status_code == 200
    assert summary_res.status_code == 200

    positions = positions_res.json()["positions"]
    summary = summary_res.json()["summary"]
    assert summary["openPositions"] == open_count
    assert len(positions) == open_count
    assert "totalValue" in summary
    assert "totalPnl" in summary

    service = PortfolioService(get_trading_store())
    session = next(
        s for s in get_trading_store().iter_sessions() if s.user_id == trader_id and s.tenant_slug == "app"
    )
    # Direct service call without refresh uses the same marked positions.
    import asyncio

    marked = asyncio.run(
        service.get_live_positions(trader_id, tenant_slug="app", session=session, refresh=False)
    )
    assert len(marked) == open_count


def test_legacy_trading_portfolio_still_works(client: TestClient):
    response = client.get("/api/v1/trading/portfolio", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert "account" in body
    assert "positions" in body
    assert "summary" in body


def test_get_portfolio_service_singleton():
    a = get_portfolio_service()
    b = get_portfolio_service()
    assert a is b
