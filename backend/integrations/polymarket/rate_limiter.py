"""Async rate limiter for outbound Polymarket CLOB requests."""

from __future__ import annotations

import asyncio
import time
from collections import deque


class AsyncRateLimiter:
    """Simple sliding-window rate limiter for async call sites.

    Parameters
    ----------
    max_requests:
        Maximum number of requests allowed within ``per_seconds``.
    per_seconds:
        Sliding window size in seconds.
    """

    def __init__(self, max_requests: int, per_seconds: float) -> None:
        if max_requests < 1:
            raise ValueError("max_requests must be >= 1")
        if per_seconds <= 0:
            raise ValueError("per_seconds must be > 0")
        self._max_requests = max_requests
        self._per_seconds = per_seconds
        self._timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Block until a request slot is available."""
        async with self._lock:
            while True:
                now = time.monotonic()
                while self._timestamps and self._timestamps[0] <= now - self._per_seconds:
                    self._timestamps.popleft()

                if len(self._timestamps) < self._max_requests:
                    self._timestamps.append(now)
                    return

                wait_seconds = self._per_seconds - (now - self._timestamps[0])
                await asyncio.sleep(max(wait_seconds, 0.01))
