"""Tests for PolymarketService normalization and caching."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from integrations.polymarket.polymarket_service import (
    PolymarketService,
    normalize_polymarket_market,
)


def _raw_market(
    *,
    condition_id: str = "0xabc123",
    question: str = "Will BTC reach 150K?",
    accepting_orders: bool = True,
    closed: bool = False,
    active: bool = True,
    tags: list[str] | None = None,
    yes_price: float = 0.62,
) -> dict:
    return {
        "condition_id": condition_id,
        "question": question,
        "description": "Crypto market",
        "market_slug": "btc-150k",
        "end_date_iso": "2026-12-31T00:00:00Z",
        "active": active,
        "closed": closed,
        "archived": False,
        "accepting_orders": accepting_orders,
        "tags": tags or ["crypto"],
        "tokens": [
            {"token_id": "1", "outcome": "Yes", "price": yes_price, "winner": False},
            {"token_id": "2", "outcome": "No", "price": 1 - yes_price, "winner": False},
        ],
    }


def test_normalize_polymarket_market_maps_internal_shape() -> None:
    normalized = normalize_polymarket_market(_raw_market())

    assert normalized["id"] == "poly-0xabc123"
    assert normalized["question"] == "Will BTC reach 150K?"
    assert normalized["category"] == "crypto"
    assert normalized["status"] in {"open", "closing_soon"}
    assert normalized["yesPrice"] == pytest.approx(0.62)
    assert normalized["source"] == "polymarket"
    assert normalized["externalConditionId"] == "0xabc123"
    assert normalized["acceptingOrders"] is True
    assert len(normalized["history"]) == 1


def test_normalize_polymarket_market_resolved_outcome() -> None:
    raw = _raw_market(closed=True, active=True, accepting_orders=False)
    raw["tokens"][0]["winner"] = True

    normalized = normalize_polymarket_market(raw)

    assert normalized["status"] == "resolved"
    assert normalized["resolvedOutcome"] == "yes"


@pytest.fixture
def service() -> PolymarketService:
    client = MagicMock()
    svc = PolymarketService(
        client,
        redis_url="redis://localhost:6379/0",
        cache_ttl_seconds=60.0,
        list_cache_ttl_seconds=120.0,
        max_fetch_pages=2,
    )
    svc._get_redis = AsyncMock(return_value=None)  # type: ignore[method-assign]
    return svc


@pytest.mark.asyncio
async def test_get_all_markets_uses_cache(service: PolymarketService) -> None:
    cached = [normalize_polymarket_market(_raw_market())]
    service._cache_get = AsyncMock(return_value=cached)  # type: ignore[method-assign]
    service._fetch_all_raw_markets = AsyncMock()  # type: ignore[method-assign]

    result = await service.get_all_markets()

    assert result == cached
    service._fetch_all_raw_markets.assert_not_called()


@pytest.mark.asyncio
async def test_get_all_markets_fetches_and_caches(service: PolymarketService) -> None:
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]
    service._fetch_all_raw_markets = AsyncMock(  # type: ignore[method-assign]
        return_value=[_raw_market(), _raw_market(condition_id="0xdef456", question="Fed cut?")]
    )

    result = await service.get_all_markets()

    assert len(result) == 2
    assert result[0]["id"] == "poly-0xabc123"
    service._cache_set.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_active_markets_filters_open_accepting(service: PolymarketService) -> None:
    open_market = normalize_polymarket_market(_raw_market(accepting_orders=True))
    closed_market = normalize_polymarket_market(
        _raw_market(condition_id="0xclosed", accepting_orders=False, closed=True)
    )
    service.get_all_markets = AsyncMock(return_value=[open_market, closed_market])  # type: ignore[method-assign]
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]

    active = await service.get_active_markets()

    assert active == [open_market]


@pytest.mark.asyncio
async def test_get_market_by_id_from_list_cache(service: PolymarketService) -> None:
    market = normalize_polymarket_market(_raw_market())
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]
    service.get_all_markets = AsyncMock(return_value=[market])  # type: ignore[method-assign]

    found = await service.get_market_by_id("poly-0xabc123")

    assert found is not None
    assert found["id"] == "poly-0xabc123"


@pytest.mark.asyncio
async def test_get_market_by_id_fetches_from_api(service: PolymarketService) -> None:
    service._cache_get = AsyncMock(return_value=None)  # type: ignore[method-assign]
    service._cache_set = AsyncMock()  # type: ignore[method-assign]
    service.get_all_markets = AsyncMock(return_value=[])  # type: ignore[method-assign]
    service._client.get_market = AsyncMock(return_value=_raw_market(condition_id="0xremote"))  # type: ignore[attr-defined]

    found = await service.get_market_by_id("0xremote")

    assert found is not None
    assert found["externalConditionId"] == "0xremote"
    service._client.get_market.assert_awaited_once_with("0xremote")


@pytest.mark.asyncio
async def test_search_markets_matches_question(service: PolymarketService) -> None:
    markets = [
        normalize_polymarket_market(_raw_market(question="Will BTC reach 150K?")),
        normalize_polymarket_market(
            _raw_market(
                condition_id="0x2",
                question="Will ETH flip SOL?",
                tags=["crypto"],
            )
        ),
    ]
    service.get_all_markets = AsyncMock(return_value=markets)  # type: ignore[method-assign]

    results = await service.search_markets("eth")

    assert len(results) == 1
    assert results[0]["question"].startswith("Will ETH")


@pytest.mark.asyncio
async def test_invalidate_cache_clears_local_entries(service: PolymarketService) -> None:
    service._local_cache["pp:polymarket:markets:all"] = (999999.0, [{"id": "x"}])
    service._get_redis = AsyncMock(return_value=None)  # type: ignore[method-assign]

    await service.invalidate_cache()

    assert service._local_cache == {}
