"""Periodic ingestion of live external event data into the database."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from services.live_event_service import get_live_event_service
from tasks.providers.base import IngestedEventSnapshot, LiveDataProvider
from tasks.providers.polymarket_polling import PolymarketPollingProvider
from tasks.providers.sports_polling import SportsPollingProvider

if TYPE_CHECKING:
    from services.live_event_service import LiveEventService

logger = logging.getLogger(__name__)

_PROVIDER_REGISTRY: dict[str, type[LiveDataProvider]] = {
    "sports": SportsPollingProvider,
    "polymarket": PolymarketPollingProvider,
}


@dataclass
class IngestionCycleResult:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    errors: int = 0


def build_providers(provider_names: list[str]) -> list[LiveDataProvider]:
    """Instantiate configured providers; unknown names are skipped with a warning."""
    providers: list[LiveDataProvider] = []
    for name in provider_names:
        factory = _PROVIDER_REGISTRY.get(name)
        if factory is None:
            logger.warning("Unknown live data provider %r — skipping", name)
            continue
        providers.append(factory())
    return providers


class LiveDataIngestionService:
    """Poll external feeds, persist snapshots, and broadcast changes."""

    def __init__(
        self,
        providers: list[LiveDataProvider] | None = None,
        *,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        configured = self._settings.ingestion_providers or ["sports"]
        self._providers = providers if providers is not None else build_providers(configured)

    async def fetch_all_snapshots(self) -> list[IngestedEventSnapshot]:
        snapshots: list[IngestedEventSnapshot] = []
        for provider in self._providers:
            try:
                batch = await provider.fetch_snapshots()
                snapshots.extend(batch)
                logger.debug("Provider %s returned %s snapshots", provider.name, len(batch))
            except Exception:  # noqa: BLE001 - one provider must not block others
                logger.exception("Live data provider %s failed", provider.name)
        return snapshots

    async def ingest_once(self, service: LiveEventService | None = None) -> IngestionCycleResult:
        """Fetch upstream data, upsert events, and broadcast when values change."""
        snapshots = await self.fetch_all_snapshots()
        result = IngestionCycleResult(fetched=len(snapshots))

        if not snapshots:
            return result

        if service is not None:
            for snapshot in snapshots:
                try:
                    ingest_result = await service.ingest_snapshot(snapshot)
                    if ingest_result.created:
                        result.created += 1
                    elif ingest_result.changed:
                        result.updated += 1
                    else:
                        result.unchanged += 1
                except Exception:  # noqa: BLE001
                    result.errors += 1
                    logger.exception(
                        "Failed to ingest snapshot %s from provider %s",
                        snapshot.external_id,
                        snapshot.provider,
                    )
            return result

        async with SessionLocal() as db:
            live_service = get_live_event_service(db)
            for snapshot in snapshots:
                try:
                    ingest_result = await live_service.ingest_snapshot(snapshot)
                    if ingest_result.created:
                        result.created += 1
                    elif ingest_result.changed:
                        result.updated += 1
                    else:
                        result.unchanged += 1
                except Exception:  # noqa: BLE001
                    result.errors += 1
                    logger.exception(
                        "Failed to ingest snapshot %s from provider %s",
                        snapshot.external_id,
                        snapshot.provider,
                    )

        if result.created or result.updated:
            logger.info(
                "Live data ingestion cycle: fetched=%s created=%s updated=%s unchanged=%s errors=%s",
                result.fetched,
                result.created,
                result.updated,
                result.unchanged,
                result.errors,
            )

        return result


async def run_live_data_ingestion() -> None:
    """Background loop that polls external providers on a fixed interval."""
    settings = get_settings()
    if not settings.ingestion_enabled:
        logger.info("Live data ingestion disabled (PP_INGESTION_ENABLED=false)")
        return

    service = LiveDataIngestionService()
    logger.info(
        "Starting live data ingestion (%ss interval, providers=%s)",
        settings.ingestion_interval_seconds,
        [provider.name for provider in service._providers],
    )

    while True:
        await asyncio.sleep(settings.ingestion_interval_seconds)
        try:
            await service.ingest_once()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - ingestion loop must stay alive
            logger.exception("Live data ingestion cycle failed")


def start_live_data_ingestion() -> asyncio.Task[None]:
    return asyncio.create_task(run_live_data_ingestion())


async def stop_live_data_ingestion(task: asyncio.Task[None]) -> None:
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


def register_provider(name: str, factory: type[LiveDataProvider]) -> None:
    """Register a custom provider implementation at runtime."""
    _PROVIDER_REGISTRY[name] = factory
