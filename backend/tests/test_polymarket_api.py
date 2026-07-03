"""API tests for Polymarket market endpoints."""

from unittest.mock import AsyncMock, patch

import pytest

from integrations.polymarket import get_polymarket_service


@pytest.fixture(autouse=True)
def clear_polymarket_service_cache():
    get_polymarket_service.cache_clear()
    yield
    get_polymarket_service.cache_clear()


def test_list_polymarket_markets(client):
    sample = [
        {
            "id": "poly-0xabc",
            "question": "Will BTC reach 150K?",
            "category": "crypto",
            "status": "open",
            "yesPrice": 0.55,
            "source": "polymarket",
        }
    ]
    mock_service = AsyncMock()
    mock_service.get_all_markets = AsyncMock(return_value=sample)

    with patch(
        "app.api.routes.polymarket.get_polymarket_service",
        return_value=mock_service,
    ):
        response = client.get("/api/v1/polymarket/markets")

    assert response.status_code == 200
    assert response.json()["markets"] == sample
    mock_service.get_all_markets.assert_awaited_once_with(refresh=False)


def test_list_polymarket_markets_search(client):
    mock_service = AsyncMock()
    mock_service.search_markets = AsyncMock(return_value=[])

    with patch(
        "app.api.routes.polymarket.get_polymarket_service",
        return_value=mock_service,
    ):
        response = client.get("/api/v1/polymarket/markets?q=btc&refresh=true")

    assert response.status_code == 200
    mock_service.search_markets.assert_awaited_once_with("btc", refresh=True)


def test_get_polymarket_market_not_found(client):
    mock_service = AsyncMock()
    mock_service.get_market_by_id = AsyncMock(return_value=None)

    with patch(
        "app.api.routes.polymarket.get_polymarket_service",
        return_value=mock_service,
    ):
        response = client.get("/api/v1/polymarket/markets/poly-0xmissing")

    assert response.status_code == 404
