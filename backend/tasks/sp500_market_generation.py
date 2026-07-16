"""Daily asyncio loop that regenerates S&P 500 dynamic LMSR markets.

Alpaca used for MVP. Will switch to Polygon for scale.

Registered from FastAPI lifespan alongside live-data ingestion.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

from app.core.config import Settings, get_settings
from services.sp500_market_generator import run_sp500_market_generation

logger = logging.getLogger(__name__)


async def run_sp500_daily_generation_loop(settings: Settings | None = None) -> None:
    """Sleep between daily generation cycles (idempotent each run)."""
    cfg = settings or get_settings()
    if not cfg.sp500_generator_enabled:
        logger.info("S&P 500 market generator disabled (PP_SP500_GENERATOR_ENABLED=false)")
        return

    if cfg.sp500_generator_run_on_startup:
        try:
            await run_sp500_market_generation(settings=cfg)
        except Exception:  # noqa: BLE001
            logger.exception("S&P 500 generator startup run failed")

    interval = max(60.0, float(cfg.sp500_generator_interval_seconds or 86_400.0))
    while True:
        await asyncio.sleep(interval)
        if not cfg.sp500_generator_enabled:
            continue
        try:
            result = await run_sp500_market_generation(settings=cfg)
            logger.info(
                "S&P 500 daily generation: created_lmsr=%s skipped=%s events_created=%s",
                result.lmsr_created,
                result.lmsr_skipped,
                result.events_created,
            )
        except Exception:  # noqa: BLE001
            logger.exception("S&P 500 daily generation cycle failed")


def start_sp500_market_generator(settings: Settings | None = None) -> asyncio.Task[None] | None:
    cfg = settings or get_settings()
    if not cfg.sp500_generator_enabled:
        return None
    return asyncio.create_task(
        run_sp500_daily_generation_loop(cfg),
        name="sp500-market-generator",
    )


async def stop_sp500_market_generator(task: asyncio.Task[None] | None) -> None:
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
