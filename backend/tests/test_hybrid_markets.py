"""Tests for hybrid market listing."""

from unittest.mock import AsyncMock, patch

import pytest

from app.runtime.hybrid_markets import get_hybrid_market, list_hybrid_markets
from app.runtime.store import get_trading_store


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
async def test_list_hybrid_markets_sp500_allowlist():
    store = get_trading_store()
    store.create_market(
        market_id="sp500-AAPL-0dte-2099-01-02-200",
        question="Will AAPL close above $200?",
        category="stocks",
        base_price=0.5,
        closes_at=9999999999999,
        source="sp500_dynamic",
        stock_ticker="AAPL",
    )
    store.create_market(
        market_id="sp500-MSFT-0dte-2099-01-02-400",
        question="Will MSFT close above $400?",
        category="stocks",
        base_price=0.5,
        closes_at=9999999999999,
        source="sp500_dynamic",
        stock_ticker="MSFT",
    )

    result = await list_hybrid_markets(
        source="sp500_dynamic",
        sp500_tickers=["AAPL"],
    )
    assert result["source"] == "sp500_dynamic"
    assert result["counts"]["sp500_dynamic"] >= 1
    assert all(m.get("stockTicker") == "AAPL" for m in result["markets"])
    assert all(m["id"].startswith("sp500-AAPL-") for m in result["markets"])


@pytest.mark.asyncio
async def test_get_hybrid_market_sp500():
    store = get_trading_store()
    market_id = "sp500-NVDA-weekly-2099-01-03-120"
    store.create_market(
        market_id=market_id,
        question="Will NVDA close above $120 this week?",
        category="stocks",
        base_price=0.48,
        closes_at=9999999999999,
        source="sp500_dynamic",
        stock_ticker="NVDA",
    )
    market = await get_hybrid_market(market_id)
    assert market is not None
    assert market["source"] == "sp500_dynamic"
    assert market["stockTicker"] == "NVDA"
