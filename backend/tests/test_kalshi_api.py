"""API tests for Kalshi market endpoints."""

from unittest.mock import AsyncMock, patch

import pytest

from integrations.kalshi import get_kalshi_service

SAMPLE_MARKETS = [
    {
        "id": "kalshi-KXBTC-25",
        "question": "Will BTC reach 150K?",
        "category": "crypto",
        "status": "open",
        "yesPrice": 0.55,
        "change24h": 0.05,
        "volume": 1000,
        "volume24h": 500,
        "closesAt": 2000,
        "acceptingOrders": True,
        "source": "kalshi",
        "externalTicker": "KXBTC-25",
    },
    {
        "id": "kalshi-KXFED-25",
        "question": "Will the Fed cut rates?",
        "category": "economics",
        "status": "resolved",
        "yesPrice": 0.2,
        "change24h": 0.01,
        "volume": 200,
        "volume24h": 50,
        "closesAt": 1000,
        "acceptingOrders": False,
        "source": "kalshi",
        "externalTicker": "KXFED-25",
    },
]


@pytest.fixture(autouse=True)
def clear_kalshi_service_cache():
    get_kalshi_service.cache_clear()
    yield
    get_kalshi_service.cache_clear()


def test_list_kalshi_markets_paginated(client):
    mock_service = AsyncMock()
    mock_service.get_all_markets = AsyncMock(return_value=SAMPLE_MARKETS)

    with patch(
        "app.api.routes.kalshi.get_kalshi_service",
        return_value=mock_service,
    ):
        response = client.get("/api/kalshi/markets?page=1&pageSize=1&sort=movers")

    assert response.status_code == 200
    body = response.json()
    assert len(body["markets"]) == 1
    assert body["pagination"]["total"] == 2
    mock_service.get_all_markets.assert_awaited_once_with(refresh=False)


def test_list_kalshi_markets_active_filter(client):
    mock_service = AsyncMock()
    mock_service.get_active_markets = AsyncMock(return_value=[SAMPLE_MARKETS[0]])

    with patch(
        "app.api.routes.kalshi.get_kalshi_service",
        return_value=mock_service,
    ):
        response = client.get("/api/kalshi/markets?active=true")

    assert response.status_code == 200
    assert response.json()["markets"] == [SAMPLE_MARKETS[0]]


def test_get_kalshi_market(client):
    mock_service = AsyncMock()
    mock_service.get_market_by_id = AsyncMock(return_value=SAMPLE_MARKETS[0])

    with patch(
        "app.api.routes.kalshi.get_kalshi_service",
        return_value=mock_service,
    ):
        response = client.get("/api/kalshi/markets/kalshi-KXBTC-25")

    assert response.status_code == 200
    assert response.json()["market"] == SAMPLE_MARKETS[0]


def test_get_kalshi_market_not_found(client):
    mock_service = AsyncMock()
    mock_service.get_market_by_id = AsyncMock(return_value=None)

    with patch(
        "app.api.routes.kalshi.get_kalshi_service",
        return_value=mock_service,
    ):
        response = client.get("/api/kalshi/markets/kalshi-MISSING")

    assert response.status_code == 404


def test_get_kalshi_orderbook(client):
    mock_service = AsyncMock()
    mock_service.get_orderbook = AsyncMock(
        return_value={"orderbook_fp": {"yes_dollars": [["0.55", "10"]]}}
    )

    with patch(
        "app.api.routes.kalshi.get_kalshi_service",
        return_value=mock_service,
    ):
        response = client.get("/api/kalshi/markets/kalshi-KXBTC-25/orderbook")

    assert response.status_code == 200
    assert "orderbook" in response.json()


def test_search_kalshi_markets(client):
    mock_service = AsyncMock()
    mock_service.search_markets = AsyncMock(return_value=SAMPLE_MARKETS)

    with patch(
        "app.api.routes.kalshi.get_kalshi_service",
        return_value=mock_service,
    ):
        response = client.get("/api/kalshi/search?q=btc")

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "btc"
    assert body["pagination"]["total"] == 2


def test_kalshi_status(client):
    mock_service = AsyncMock()
    mock_service.get_integration_status = AsyncMock(
        return_value={"provider": "kalshi", "healthy": True, "api": "connected"}
    )

    with patch(
        "app.api.routes.kalshi.get_kalshi_service",
        return_value=mock_service,
    ):
        response = client.get("/api/kalshi/status")

    assert response.status_code == 200
    assert response.json()["healthy"] is True
