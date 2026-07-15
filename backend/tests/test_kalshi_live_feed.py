"""Tests for Kalshi live feed integration."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from tasks.providers.kalshi_polling import KalshiPollingProvider


@pytest.mark.asyncio
async def test_kalshi_polling_provider_emits_snapshots() -> None:
    markets = [
        {
            "id": "kalshi-KXBTC-25",
            "question": "Bitcoin above 100k?",
            "category": "crypto",
            "yesPrice": 0.62,
            "status": "open",
            "volume": 50000,
            "volume24h": 12000,
            "change24h": 0.0,
            "externalTicker": "KXBTC-25",
        }
    ]

    with patch(
        "tasks.providers.kalshi_polling.get_kalshi_service",
    ) as mock_get_service:
        service = AsyncMock()
        service.get_active_markets = AsyncMock(return_value=markets)
        mock_get_service.return_value = service

        snapshots = await KalshiPollingProvider(limit=10).fetch_snapshots()

    assert len(snapshots) == 1
    assert snapshots[0].source == "kalshi"
    assert snapshots[0].external_id == "kalshi-KXBTC-25"
    assert snapshots[0].probabilities["yes"] == 0.62


@pytest.mark.asyncio
async def test_place_external_kalshi_order(client) -> None:
    """Virtual bet on a Kalshi market debits bankroll at external price."""
    from fastapi.testclient import TestClient

    market = {
        "id": "kalshi-KXTEST-25",
        "question": "Test market?",
        "category": "economics",
        "yesPrice": 0.55,
        "status": "open",
        "volume": 1000,
        "volume24h": 500,
    }

    with patch(
        "app.api.routes.trading.get_kalshi_service",
    ) as mock_get_service:
        service = AsyncMock()
        service.get_market_by_id = AsyncMock(return_value=market)
        mock_get_service.return_value = service

        response = client.post(
            "/api/v1/trading/orders",
            headers={"X-Tenant-Slug": "app"},
            json={
                "marketId": "kalshi-KXTEST-25",
                "outcome": "yes",
                "side": "buy",
                "shares": 100,
            },
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["order"]["marketId"] == "kalshi-KXTEST-25"
    assert body["order"]["shares"] == 100
    assert abs(body["order"]["price"] - 0.55) < 0.01

    portfolio = client.get("/api/v1/trading/portfolio", headers={"X-Tenant-Slug": "app"})
    assert portfolio.status_code == 200
    positions = portfolio.json()["positions"]
    assert any(p["marketId"] == "kalshi-KXTEST-25" for p in positions)
