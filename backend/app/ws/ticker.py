import asyncio
import contextlib
import logging
import random
import time

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import Tenant
from app.ws.manager import manager

from app.runtime.store import get_trading_store

logger = logging.getLogger(__name__)

# Demo instruments; replaced by the real matching engine's trade feed.
# Ids match the frontend's seeded markets so connected clients see cards
# tick in real time.
DEMO_MARKETS: dict[str, float] = {
    "mkt-1": 0.42,
    "mkt-4": 0.56,
    "mkt-11": 0.68,
    "mkt-14": 0.58,
}


async def run_market_ticker() -> None:
    """Broadcasts simulated price ticks to every active tenant's channel.

    Keeps the real-time pipeline (WebSocket + Redis pub/sub) exercised end
    to end before the real matching engine exists.
    """
    settings = get_settings()
    prices = dict(DEMO_MARKETS)

    while True:
        await asyncio.sleep(settings.ticker_interval_seconds)
        market_id = random.choice(list(prices))
        drift = random.uniform(-0.02, 0.02)
        prices[market_id] = min(0.97, max(0.03, prices[market_id] + drift))
        yes_price = round(prices[market_id], 3)

        get_trading_store().apply_price_tick(market_id, yes_price)

        tick = {
            "type": "price_tick",
            "market_id": market_id,
            "yes_price": yes_price,
            "ts": int(time.time() * 1000),
        }

        try:
            async with SessionLocal() as db:
                result = await db.execute(select(Tenant.slug).where(Tenant.is_active))
                slugs = [row[0] for row in result]
            for slug in slugs:
                await manager.broadcast(slug, tick)
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
