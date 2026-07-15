"""Tests for KalshiService normalization and caching."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from integrations.kalshi.kalshi_service import (
    KalshiService,
    normalize_kalshi_market,
)


def _raw_market(
    *,
    ticker: str = "KXBTC-25DEC31",
    title: str = "Will BTC close above 100K?",
    status: str = "active",
    yes_bid: str = "0.5200",
    yes_ask: str = "0.5400",
    last_price: str = "0.5300",
) -> dict:
    return {
        "ticker": ticker,
        "title": title,
        "event_ticker": "KXBTC",
        "series_ticker": "KXBTC",
        "status": status,
        "close_time": "2026-12-31T00:00:00Z",
        "yes_bid_dollars": yes_bid,
        "yes_ask_dollars": yes_ask,
        "last_price_dollars": last_price,
        "volume_fp": "12500.00",
        "volume_24h_fp": "3200.00",
        "open_interest_fp": "800.00",
    }


def test_normalize_kalshi_market_maps_internal_shape() -> None:
    normalized = normalize_kalshi_market(_raw_market())

    assert normalized["id"] == "kalshi-KXBTC-25DEC31"
    assert normalized["question"] == "Will BTC close above 100K?"
    assert normalized["category"] == "crypto"
    assert normalized["status"] in {"open", "closing_soon"}
    assert normalized["yesPrice"] == pytest.approx(0.53)
    assert normalized["source"] == "kalshi"
    assert normalized["externalTicker"] == "KXBTC-25DEC31"
    assert normalized["acceptingOrders"] is True
    assert len(normalized["history"]) == 1


def test_normalize_kalshi_market_resolved() -> None:
    raw = _raw_market(status="settled", last_price="1.0000")
    raw["result"] = "yes"

    normalized = normalize_kalshi_market(raw)

    assert normalized["status"] == "resolved"
    assert normalized["resolvedOutcome"] == "yes"
    assert normalized["acceptingOrders"] is False


@pytest.fixture
def service() -> KalshiService:
    client = MagicMock()
    svc = KalshiService(
        client,
        redis_url="redis://localhost:6379/0",
        cache_ttl_seconds=60.0,
        list_cache_ttl_seconds=120.0,
        price_cache_ttl_seconds=15.0,
        max_fetch_pages=2,
    )
    svc._get_redis = AsyncMock(return_value=None)  # type: ignore[method-assign]
    return svc


@pytest.mark.asyncio
async def test_get_all_markets_uses_cache(service: KalshiService) -> None:
    cached = [normalize_kalshi_market(_raw_market())]
    service._cache_get = AsyncMock(return_value=cached)  # type: ignore[method-assign]
    service._fetch_all_raw_markets = AsyncMock()  # type: ignore[method-assign]

    result = await service.get_all_markets()

    assert result == cached
    service._fetch_all_raw_markets.assert_not_called()


@pytest.mark.asyncio
async def test_get_all_markets_fetches_and_caches(service: KalshiService) -> None:
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]
    service._fetch_all_raw_markets = AsyncMock(  # type: ignore[method-assign]
        return_value=[
            _raw_market(),
            _raw_market(ticker="KXFED-25", title="Fed cut rates?"),
        ]
    )

    result = await service.get_all_markets()

    assert len(result) == 2
    assert result[0]["source"] == "kalshi"
    service._cache_set.assert_awaited()


@pytest.mark.asyncio
async def test_get_active_markets_filters(service: KalshiService) -> None:
    open_market = normalize_kalshi_market(_raw_market())
    resolved = normalize_kalshi_market(_raw_market(ticker="OLD-1", status="settled"))

    service.get_all_markets = AsyncMock(return_value=[open_market, resolved])  # type: ignore[method-assign]
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]

    active = await service.get_active_markets()

    assert active == [open_market]


@pytest.mark.asyncio
async def test_get_market_by_id_from_cache(service: KalshiService) -> None:
    cached = normalize_kalshi_market(_raw_market())
    service._cache_get = AsyncMock(return_value=cached)  # type: ignore[method-assign]

    result = await service.get_market_by_id("kalshi-KXBTC-25DEC31")

    assert result == cached


@pytest.mark.asyncio
async def test_get_market_by_id_fetches_remote(service: KalshiService) -> None:
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]
    service.get_all_markets = AsyncMock(return_value=[])  # type: ignore[method-assign]
    service._client.get_market = AsyncMock(return_value=_raw_market())  # type: ignore[attr-defined]

    result = await service.get_market_by_id("KXBTC-25DEC31")

    assert result is not None
    assert result["externalTicker"] == "KXBTC-25DEC31"


@pytest.mark.asyncio
async def test_search_markets(service: KalshiService) -> None:
    markets = [
        normalize_kalshi_market(_raw_market()),
        normalize_kalshi_market(_raw_market(ticker="KXFED-25", title="Fed cut?")),
    ]
    service.get_all_markets = AsyncMock(return_value=markets)  # type: ignore[method-assign]

    results = await service.search_markets("fed")

    assert len(results) == 1
    assert results[0]["externalTicker"] == "KXFED-25"


@pytest.mark.asyncio
async def test_get_live_price_from_orderbook(service: KalshiService) -> None:
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]
    service.get_orderbook = AsyncMock(  # type: ignore[method-assign]
        return_value={"orderbook_fp": {"yes_dollars": [["0.61", "5"]]}}
    )

    price = await service.get_live_price("KXBTC-25DEC31")

    assert price == pytest.approx(0.61)


@pytest.mark.asyncio
async def test_get_integration_status_connected(service: KalshiService) -> None:
    page = MagicMock()
    page.markets = [_raw_market()]
    service._client.get_markets = AsyncMock(return_value=page)  # type: ignore[attr-defined]
    service._client.base_url = "https://api.elections.kalshi.com/trade-api/v2"
    service._client.auth_mode = "public"
    service._client.is_authenticated = False
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]

    status = await service.get_integration_status()

    assert status["healthy"] is True
    assert status["api"] == "connected"
    assert status["provider"] == "kalshi"
