"""Tests for the Polymarket async rate limiter."""

from __future__ import annotations

import asyncio
import time

import pytest

from integrations.polymarket.rate_limiter import AsyncRateLimiter


def test_rate_limiter_rejects_invalid_config() -> None:
    with pytest.raises(ValueError, match="max_requests"):
        AsyncRateLimiter(max_requests=0, per_seconds=1.0)

    with pytest.raises(ValueError, match="per_seconds"):
        AsyncRateLimiter(max_requests=1, per_seconds=0.0)


@pytest.mark.asyncio
async def test_rate_limiter_allows_burst_within_window() -> None:
    limiter = AsyncRateLimiter(max_requests=3, per_seconds=1.0)

    for _ in range(3):
        await limiter.acquire()

    assert len(limiter._timestamps) == 3


@pytest.mark.asyncio
async def test_rate_limiter_blocks_when_window_full() -> None:
    limiter = AsyncRateLimiter(max_requests=2, per_seconds=0.2)

    await limiter.acquire()
    await limiter.acquire()

    started = time.monotonic()
    await limiter.acquire()
    elapsed = time.monotonic() - started

    assert elapsed >= 0.05
