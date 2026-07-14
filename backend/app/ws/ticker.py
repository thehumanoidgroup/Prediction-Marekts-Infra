import asyncio
import contextlib
import logging
import random
import time

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import Tenant
from app.models.live_event import LiveEventSource
from app.ws.manager import manager
from services.live_event_service import get_live_event_service

logger = logging.getLogger(__name__)


async def run_market_ticker() -> None:
    """Broadcast live event probability ticks to every active tenant channel."""
    settings = get_settings()

    while True:
        await asyncio.sleep(settings.ticker_interval_seconds)

        try:
            async with SessionLocal() as db:
                service = get_live_event_service(db)
                events = await service.get_all_live_events()
                internal_events = [
                    event for event in events if event.source == LiveEventSource.INTERNAL
                ]
                if not internal_events:
                    continue

                event = random.choice(internal_events)
                yes = float(event.probabilities.get("yes", 0.5))
                drift = random.uniform(-0.02, 0.02)
                new_yes = round(min(0.97, max(0.03, yes + drift)), 3)

                updated = await service.update_event_probability(
                    event.id,
                    {"yes": new_yes},
                    volume_delta=random.uniform(500, 5_000),
                )
                if updated is None:
                    continue

                tick = {
                    "type": "price_tick",
                    "market_id": updated.external_id,
                    "yes_price": updated.probabilities.get("yes", new_yes),
                    "ts": int(time.time() * 1000),
                }

                result = await db.execute(select(Tenant.slug).where(Tenant.is_active))
                slugs = [row[0] for row in result]
                for slug in slugs:
                    await manager.broadcast(slug, tick)

                await service.broadcast_event_update(
                    updated.id,
                    {
                        "probabilities": updated.probabilities,
                        "volume": updated.volume,
                        "volume_24h": updated.volume_24h,
                        "change_24h": updated.change_24h,
                        "category": updated.category,
                        "status": updated.status.value,
                    },
                )
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - the ticker must never die
            logger.exception("Market ticker iteration failed")


def start_ticker() -> asyncio.Task[None]:
    return asyncio.create_task(run_market_ticker())


async def stop_ticker(task: asyncio.Task[None]) -> None:
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
