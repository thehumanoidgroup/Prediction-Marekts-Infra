"""Tests for live event models and service."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models.live_event import EventUpdate, LiveEvent, LiveEventSource
from services.live_event_service import LiveEventService, _normalize_probabilities

_POLY_STUB = type(
    "StubPolyService",
    (),
    {"get_active_markets": AsyncMock(return_value=[])},
)()

_KALSHI_STUB = type(
    "StubKalshiService",
    (),
    {
        "get_active_markets": AsyncMock(return_value=[]),
        "get_market_by_id": AsyncMock(return_value=None),
    },
)()


@pytest.fixture(autouse=True)
def stub_polymarket():
    with patch("services.live_event_service.get_polymarket_service", return_value=_POLY_STUB):
        yield


@pytest.fixture(autouse=True)
def stub_kalshi():
    with patch("services.live_event_service.get_kalshi_service", return_value=_KALSHI_STUB):
        yield


@pytest.mark.asyncio
async def test_normalize_probabilities_accepts_aliases():
    assert _normalize_probabilities({"yesPrice": 0.6}) == {"yes": 0.6, "no": 0.4}
    assert _normalize_probabilities({"yes": 0.7, "no": 0.3}) == {"yes": 0.7, "no": 0.3}


@pytest.mark.asyncio
async def test_sync_from_sources_creates_internal_events(db_session):
    service = LiveEventService(db_session)
    await service.sync_from_sources(polymarket_limit=0)

    result = await db_session.execute(select(LiveEvent))
    events = list(result.scalars().all())
    assert events
    assert any(event.source == LiveEventSource.INTERNAL for event in events)


@pytest.mark.asyncio
async def test_get_events_by_category_filters(db_session):
    service = LiveEventService(db_session)
    crypto = await service.get_events_by_category("crypto")
    assert crypto
    assert all(event.category == "crypto" for event in crypto)


@pytest.mark.asyncio
async def test_update_event_probability_records_history(db_session):
    service = LiveEventService(db_session)
    events = await service.get_all_live_events()
    internal = next(event for event in events if event.source == LiveEventSource.INTERNAL)

    updated = await service.update_event_probability(
        internal.id,
        {"yes": 0.61},
        volume_delta=1_000,
    )
    assert updated is not None
    assert updated.probabilities["yes"] == pytest.approx(0.61, abs=0.02)
    assert updated.volume >= internal.volume

    history = await db_session.execute(
        select(EventUpdate).where(EventUpdate.event_id == updated.id)
    )
    rows = list(history.scalars().all())
    assert rows
    assert rows[-1].probabilities_after["yes"] == pytest.approx(0.61, abs=0.02)


@pytest.mark.asyncio
async def test_broadcast_event_update_publishes_to_tenants(db_session):
    service = LiveEventService(db_session)
    events = await service.get_all_live_events()
    event = events[0]

    with patch(
        "services.live_event_service.broadcast_live_event_changes",
        AsyncMock(),
    ) as broadcast:
        await service.broadcast_event_update(
            event.id,
            {"probabilities": event.probabilities},
        )

    broadcast.assert_awaited_once()


def test_live_events_api_list(client):
    response = client.get("/api/v1/live-events")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 1
    assert "counts" in body
    assert body["events"][0]["source"] in {"internal", "polymarket", "kalshi", "external"}


def test_live_events_api_source_filter(client):
    response = client.get("/api/v1/live-events", params={"source": "internal"})
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "internal"
    assert all(event["source"] == "internal" for event in body["events"])


def test_live_events_api_category_filter(client):
    response = client.get("/api/v1/live-events", params={"category": "crypto"})
    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 1
    assert all(event["category"] == "crypto" for event in body["events"])


def test_live_events_api_update_probability(client):
    listing = client.get("/api/v1/live-events", params={"category": "crypto"})
    events = listing.json()["events"]
    internal = next(event for event in events if event["source"] == "internal")
    event_id = internal["id"]

    response = client.post(
        f"/api/v1/live-events/{event_id}/probability",
        json={"probabilities": {"yes": 0.58, "no": 0.42}, "volume_delta": 250},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["probabilities"]["yes"] == pytest.approx(0.58, abs=0.02)

    history = client.get(f"/api/v1/live-events/{event_id}/updates")
    assert history.status_code == 200
    assert len(history.json()) >= 1
