"""EOD asyncio loop that resolves expired S&P 500 dynamic markets.

Fetches Alpaca daily closes, settles LMSR bankrolls, and writes audit logs.
Retries failed cycles with exponential backoff.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import Settings, get_settings
from services.sp500_resolution_service import run_sp500_market_resolution

logger = logging.getLogger(__name__)

_ET = ZoneInfo("America/New_York")


def _seconds_until_next_eod_window(settings: Settings) -> float:
    """Sleep until the next post-close window (default 16:15 America/New_York)."""
    now = datetime.now(_ET)
    hour = int(getattr(settings, "sp500_resolution_hour_et", 16) or 16)
    minute = int(getattr(settings, "sp500_resolution_minute_et", 15) or 15)
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if now >= target:
        target = target + timedelta(days=1)
    return max(30.0, (target - now).total_seconds())


async def _run_with_retries(settings: Settings) -> None:
    attempts = max(1, int(settings.sp500_resolution_max_retries or 3))
    backoff = float(settings.sp500_resolution_retry_backoff_seconds or 30.0)
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            result = await run_sp500_market_resolution(settings=settings)
            logger.info(
                "S&P 500 EOD resolution ok (attempt %s): resolved=%s skipped=%s failed=%s",
                attempt,
                result.resolved,
                result.skipped,
                result.failed,
            )
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.exception(
                "S&P 500 EOD resolution cycle failed (attempt %s/%s)",
                attempt,
                attempts,
            )
            if attempt < attempts:
                await asyncio.sleep(backoff * (2 ** (attempt - 1)))

    if last_error is not None:
        logger.error("S&P 500 EOD resolution exhausted retries: %s", last_error)


async def run_sp500_eod_resolution_loop(settings: Settings | None = None) -> None:
    cfg = settings or get_settings()
    if not cfg.sp500_resolution_enabled:
        logger.info("S&P 500 resolution disabled (PP_SP500_RESOLUTION_ENABLED=false)")
        return

    if cfg.sp500_resolution_run_on_startup:
        await _run_with_retries(cfg)

    use_fixed_interval = float(cfg.sp500_resolution_interval_seconds or 0) > 0
    while True:
        if use_fixed_interval:
            await asyncio.sleep(max(60.0, float(cfg.sp500_resolution_interval_seconds)))
        else:
            await asyncio.sleep(_seconds_until_next_eod_window(cfg))
        if not cfg.sp500_resolution_enabled:
            continue
        await _run_with_retries(cfg)


def start_sp500_market_resolution(settings: Settings | None = None) -> asyncio.Task[None] | None:
    cfg = settings or get_settings()
    if not cfg.sp500_resolution_enabled:
        return None
    return asyncio.create_task(
        run_sp500_eod_resolution_loop(cfg),
        name="sp500-market-resolution",
    )


async def stop_sp500_market_resolution(task: asyncio.Task[None] | None) -> None:
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
