import asyncio
import contextlib
import logging
import random

from app.core.config import get_settings
from app.db.session import SessionLocal
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
                tradable_events = list(events)
                if not tradable_events:
                    continue

                event = random.choice(tradable_events)
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
