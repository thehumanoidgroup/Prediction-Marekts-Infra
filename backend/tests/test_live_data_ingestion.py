"""Tests for live external data ingestion."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models.live_event import LiveEvent, LiveEventSource
from services.live_event_service import LiveEventService
from tasks.live_data_ingestion import LiveDataIngestionService, build_providers
from tasks.providers.base import IngestedEventSnapshot
from tasks.providers.sports_polling import SportsPollingProvider


@pytest.mark.asyncio
async def test_sports_provider_returns_snapshots():
    provider = SportsPollingProvider()
    snapshots = await provider.fetch_snapshots()

    assert len(snapshots) >= 5
    assert all(snapshot.source == "external" for snapshot in snapshots)
    assert any(snapshot.category == "sports" for snapshot in snapshots)
    assert any(snapshot.category == "politics" for snapshot in snapshots)
    assert any(snapshot.category == "crypto" for snapshot in snapshots)


@pytest.mark.asyncio
async def test_sports_provider_prices_drift_between_polls():
    provider = SportsPollingProvider()
    first = await provider.fetch_snapshots()
    second = await provider.fetch_snapshots()

    first_map = {snapshot.external_id: snapshot.probabilities["yes"] for snapshot in first}
    second_map = {snapshot.external_id: snapshot.probabilities["yes"] for snapshot in second}
    assert first_map != second_map


@pytest.mark.asyncio
async def test_ingest_snapshot_creates_external_event(db_session):
    service = LiveEventService(db_session)
    external_id = f"ext-sports-test-game-{uuid.uuid4().hex[:8]}"
    snapshot = IngestedEventSnapshot(
        external_id=external_id,
        source="external",
        category="sports",
        question="Will Team A win tonight?",
        probabilities={"yes": 0.57, "no": 0.43},
        provider="sports",
    )

    with patch("services.live_event_service.broadcast_new_event", AsyncMock()) as broadcast:
        result = await service.ingest_snapshot(snapshot)

    assert result.created is True
    assert result.event.source == LiveEventSource.EXTERNAL

    row = await db_session.execute(
        select(LiveEvent).where(LiveEvent.external_id == external_id)
    )
    assert row.scalar_one_or_none() is not None
    broadcast.assert_awaited_once()


@pytest.mark.asyncio
async def test_ingest_snapshot_updates_and_broadcasts_changes(db_session):
    service = LiveEventService(db_session)
    snapshot = IngestedEventSnapshot(
        external_id="ext-sports-update-test",
        source="external",
        category="sports",
        question="Will Team B cover the spread?",
        probabilities={"yes": 0.5, "no": 0.5},
        provider="sports",
    )
    await service.ingest_snapshot(snapshot, broadcast=False)

    with patch(
        "services.live_event_service.broadcast_live_event_changes",
        AsyncMock(),
    ) as broadcast:
        result = await service.ingest_snapshot(
            IngestedEventSnapshot(
                external_id="ext-sports-update-test",
                source="external",
                category="sports",
                question="Will Team B cover the spread?",
                probabilities={"yes": 0.63, "no": 0.37},
                volume=1_500_000,
                volume_24h=120_000,
                provider="sports",
            )
        )

    assert result.created is False
    assert result.changed is True
    broadcast.assert_awaited_once()


@pytest.mark.asyncio
async def test_live_data_ingestion_service_cycle(db_session):
    provider = SportsPollingProvider()
    ingestion = LiveDataIngestionService(providers=[provider])
    service = LiveEventService(db_session)

    with patch(
        "services.live_event_service.broadcast_new_event",
        AsyncMock(),
    ), patch(
        "services.live_event_service.broadcast_live_event_changes",
        AsyncMock(),
    ):
        first = await ingestion.ingest_once(service)
        second = await ingestion.ingest_once(service)

    assert first.fetched >= 5
    assert first.created + first.updated >= 5
    assert second.updated >= 1 or second.unchanged >= 1


def test_build_providers_skips_unknown():
    providers = build_providers(["sports", "unknown-provider"])
    assert len(providers) == 1
    assert providers[0].name == "sports"
