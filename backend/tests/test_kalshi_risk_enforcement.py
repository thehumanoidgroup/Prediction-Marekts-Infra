"""Kalshi virtual betting must obey the same risk engine rules as internal markets."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.runtime.store import get_trading_store

APEX_HEADERS = {"X-Tenant-Slug": "apex"}
KALSHI_MARKET_ID = "kalshi-KXBTC-25DEC31"


def _warm_apex_kalshi_session(client: TestClient) -> None:
    """Ensure the apex demo trader session allows default Kalshi tickers."""
    client.get("/api/v1/trading/portfolio", headers=APEX_HEADERS)
    store = get_trading_store()
    for (tenant_slug, _), session in store._sessions.items():
        if tenant_slug == "apex":
            session.kalshi_market_tickers = ["KXBTC-25DEC31", "KXFED-25DEC31"]
            session.provider = "kalshi"
            return


def test_preview_order_risk_enforces_stake_cap() -> None:
    store = get_trading_store()
    program = {
        "starting_balance": 10_000,
        "account_sizes": [10_000],
        "profit_target_pct": 10,
        "max_daily_loss_pct": 5,
        "max_drawdown_pct": 10,
        "drawdown_mode": "static",
        "max_stake_per_order": 100,
        "max_exposure_per_market": 5_000,
        "min_trading_days": 1,
    }
    session = store.reset_session(
        "risk-test",
        "trader-1",
        program,
        provider="kalshi",
        kalshi_market_tickers=["KXTEST-25"],
    )

    preview = store.preview_order_risk(
        session,
        market_id="kalshi-KXTEST-25",
        outcome="yes",
        side="buy",
        shares=500,
        yes_price=0.55,
    )

    assert preview["allowed"] is False
    assert any("per-pick limit" in reason for reason in preview["reasons"])
    assert preview["maxStakePerOrder"] == 100


def test_kalshi_order_preview_api(client: TestClient) -> None:
    _warm_apex_kalshi_session(client)
    market = {
        "id": KALSHI_MARKET_ID,
        "question": "Bitcoin price?",
        "category": "crypto",
        "yesPrice": 0.55,
        "status": "open",
    }

    with patch("app.api.routes.trading.get_kalshi_service") as mock_get_service:
        service = AsyncMock()
        service.get_market_by_id = AsyncMock(return_value=market)
        mock_get_service.return_value = service

        preview = client.post(
            "/api/v1/trading/orders/preview",
            headers=APEX_HEADERS,
            json={
                "marketId": KALSHI_MARKET_ID,
                "outcome": "yes",
                "side": "buy",
                "shares": 10_000,
                "yesPrice": 0.55,
            },
        )

    assert preview.status_code == 200, preview.text
    body = preview.json()["preview"]
    assert body["allowed"] is False
    assert body["reasons"]


def test_kalshi_order_rejected_when_over_stake_cap(client: TestClient) -> None:
    _warm_apex_kalshi_session(client)
    market = {
        "id": KALSHI_MARKET_ID,
        "question": "Bitcoin price?",
        "category": "crypto",
        "yesPrice": 0.55,
        "status": "open",
    }

    with patch("app.api.routes.trading.get_kalshi_service") as mock_get_service:
        service = AsyncMock()
        service.get_market_by_id = AsyncMock(return_value=market)
        mock_get_service.return_value = service

        order = client.post(
            "/api/v1/trading/orders",
            headers=APEX_HEADERS,
            json={
                "marketId": KALSHI_MARKET_ID,
                "outcome": "yes",
                "side": "buy",
                "shares": 10_000,
            },
        )

    assert order.status_code == 422, order.text
    detail = order.json()["detail"]
    assert "per-pick limit" in detail or "exposure" in detail.lower()


def test_kalshi_portfolio_includes_risk_metadata(client: TestClient) -> None:
    _warm_apex_kalshi_session(client)
    market = {
        "id": KALSHI_MARKET_ID,
        "question": "Bitcoin price?",
        "category": "crypto",
        "yesPrice": 0.55,
        "status": "open",
    }

    with patch("app.api.routes.trading.get_kalshi_service") as mock_get_service:
        service = AsyncMock()
        service.get_market_by_id = AsyncMock(return_value=market)
        mock_get_service.return_value = service

        order = client.post(
            "/api/v1/trading/orders",
            headers=APEX_HEADERS,
            json={
                "marketId": KALSHI_MARKET_ID,
                "outcome": "yes",
                "side": "buy",
                "shares": 50,
            },
        )
        assert order.status_code == 201, order.text

        portfolio = client.get("/api/v1/trading/portfolio", headers=APEX_HEADERS)

    assert portfolio.status_code == 200
    account = portfolio.json()["account"]
    assert account["challengeStatus"] in {"active", "passed", "failed"}
    assert account["drawdownFloor"] > 0
    assert account["riskLimits"]["maxStakePerOrder"] is not None
    assert len(account["objectives"]) == 4
    positions = portfolio.json()["positions"]
    assert any(p["marketId"] == KALSHI_MARKET_ID for p in positions)


def test_sync_session_risk_updates_equity_on_price_move() -> None:
    store = get_trading_store()
    program = {
        "starting_balance": 10_000,
        "account_sizes": [10_000],
        "profit_target_pct": 10,
        "max_daily_loss_pct": 5,
        "max_drawdown_pct": 10,
        "drawdown_mode": "static",
        "max_stake_per_order": 2_500,
        "max_exposure_per_market": 5_000,
        "min_trading_days": 1,
    }
    session = store.reset_session("risk-mtm", "trader-2", program, provider="kalshi")

    store.place_external_order(
        session,
        market_id="kalshi-KXTEST-25",
        market_question="Test?",
        outcome="yes",
        side="buy",
        shares=100,
        yes_price=0.50,
    )
    equity_before = session.bankroll.mark_to_market(
        store.market_prices_for_session(session)
    ).equity

    session.external_markets["kalshi-KXTEST-25"]["yesPrice"] = 0.70
    store.sync_session_risk(session)
    equity_after = session.bankroll.mark_to_market(
        store.market_prices_for_session(session)
    ).equity

    assert equity_after > equity_before
    assert session.equity_curve[-1]["p"] == pytest.approx(equity_after, rel=1e-4)
