"""Tests for hybrid market listing."""

from unittest.mock import AsyncMock, patch

import pytest

from app.runtime.hybrid_markets import get_hybrid_market, list_hybrid_markets


@pytest.mark.asyncio
async def test_list_hybrid_markets_internal_only():
    result = await list_hybrid_markets(source="internal")
    assert result["source"] == "internal"
    assert len(result["markets"]) >= 1
    assert all(market["source"] == "internal" for market in result["markets"])


@pytest.mark.asyncio
async def test_list_hybrid_markets_polymarket_only():
    sample = [
        {
            "id": "poly-0xabc",
            "question": "Will BTC reach 150K?",
            "category": "crypto",
            "status": "open",
            "yesPrice": 0.55,
            "source": "polymarket",
            "volume": 0,
            "volume24h": 0,
            "change24h": 0,
            "closesAt": 9999999999999,
        }
    ]
    with patch(
        "app.runtime.hybrid_markets._load_polymarket_markets",
        AsyncMock(return_value=sample),
    ):
        result = await list_hybrid_markets(source="polymarket")

    assert result["source"] == "polymarket"
    assert result["markets"] == sample
    assert result["counts"]["polymarket"] == 1


@pytest.mark.asyncio
async def test_list_hybrid_markets_combined():
    poly = [
        {
            "id": "poly-0xabc",
            "question": "Polymarket only market",
            "category": "crypto",
            "status": "open",
            "yesPrice": 0.55,
            "source": "polymarket",
            "volume": 0,
            "volume24h": 0,
            "change24h": 0,
            "closesAt": 9999999999999,
        }
    ]
    with patch(
        "app.runtime.hybrid_markets._load_polymarket_markets",
        AsyncMock(return_value=poly),
    ):
        result = await list_hybrid_markets(source="all")

    assert result["source"] == "all"
    assert result["counts"]["internal"] >= 1
    assert result["counts"]["polymarket"] == 1
    assert any(market["source"] == "internal" for market in result["markets"])
    assert any(market["source"] == "polymarket" for market in result["markets"])


@pytest.mark.asyncio
async def test_get_hybrid_market_internal():
    market = await get_hybrid_market("mkt-1")
    assert market is not None
    assert market["source"] == "internal"


@pytest.mark.asyncio
async def test_get_hybrid_market_polymarket():
    sample = {"id": "poly-0xabc", "source": "polymarket", "question": "Test?"}
    with patch(
        "app.runtime.hybrid_markets.get_polymarket_service",
    ) as mock_get_service:
        mock_get_service.return_value.get_market_by_id = AsyncMock(return_value=sample)
        market = await get_hybrid_market("poly-0xabc")

    assert market == sample
