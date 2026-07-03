"""API tests for Polymarket market endpoints."""

from unittest.mock import AsyncMock, patch

import pytest

from integrations.polymarket import get_polymarket_service

SAMPLE_MARKETS = [
    {
        "id": "poly-0xabc",
        "question": "Will BTC reach 150K?",
        "category": "crypto",
        "status": "open",
        "yesPrice": 0.55,
        "change24h": 0.05,
        "volume": 1000,
        "volume24h": 500,
        "closesAt": 2000,
        "acceptingOrders": True,
        "source": "polymarket",
    },
    {
        "id": "poly-0xdef",
        "question": "Will ETH flip SOL?",
        "category": "crypto",
        "status": "resolved",
        "yesPrice": 0.2,
        "change24h": 0.01,
        "volume": 200,
        "volume24h": 50,
        "closesAt": 1000,
        "acceptingOrders": False,
        "source": "polymarket",
    },
]


@pytest.fixture(autouse=True)
def clear_polymarket_service_cache():
    get_polymarket_service.cache_clear()
    yield
    get_polymarket_service.cache_clear()


def test_list_polymarket_markets_paginated(client):
    mock_service = AsyncMock()
    mock_service.get_all_markets = AsyncMock(return_value=SAMPLE_MARKETS)

    with patch(
        "app.api.routes.polymarket.get_polymarket_service",
        return_value=mock_service,
    ):
        response = client.get("/api/polymarket/markets?page=1&pageSize=1&sort=movers")

    assert response.status_code == 200
    body = response.json()
    assert len(body["markets"]) == 1
    assert body["pagination"]["total"] == 2
    assert body["pagination"]["pageSize"] == 1
    mock_service.get_all_markets.assert_awaited_once_with(refresh=False)


def test_list_polymarket_markets_active_filter(client):
    mock_service = AsyncMock()
    mock_service.get_active_markets = AsyncMock(return_value=[SAMPLE_MARKETS[0]])

    with patch(
        "app.api.routes.polymarket.get_polymarket_service",
        return_value=mock_service,
    ):
        response = client.get("/api/polymarket/markets?active=true")

    assert response.status_code == 200
    assert response.json()["markets"] == [SAMPLE_MARKETS[0]]
    mock_service.get_active_markets.assert_awaited_once_with(refresh=False)


def test_search_polymarket_markets(client):
    mock_service = AsyncMock()
    mock_service.search_markets = AsyncMock(return_value=[SAMPLE_MARKETS[0]])

    with patch(
        "app.api.routes.polymarket.get_polymarket_service",
        return_value=mock_service,
    ):
        response = client.get("/api/polymarket/search?q=btc&category=crypto")

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "btc"
    assert body["markets"] == [SAMPLE_MARKETS[0]]
    mock_service.search_markets.assert_awaited_once_with("btc", refresh=False)


def test_get_polymarket_market_not_found(client):
    mock_service = AsyncMock()
    mock_service.get_market_by_id = AsyncMock(return_value=None)

    with patch(
        "app.api.routes.polymarket.get_polymarket_service",
        return_value=mock_service,
    ):
        response = client.get("/api/polymarket/markets/poly-0xmissing")

    assert response.status_code == 404
