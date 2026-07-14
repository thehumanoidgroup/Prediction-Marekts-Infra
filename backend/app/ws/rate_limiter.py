"""WebSocket connection and message rate limiting."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import DefaultDict

from fastapi import WebSocket

from app.core.config import get_settings


class WSRateLimiter:
    """Sliding-window limits for WebSocket connections and inbound messages."""

    def __init__(self) -> None:
        self._connection_attempts: DefaultDict[str, deque[float]] = defaultdict(deque)
        self._message_times: dict[WebSocket, deque[float]] = {}

    def _prune(self, window: deque[float], horizon: float) -> None:
        cutoff = time.monotonic() - horizon
        while window and window[0] < cutoff:
            window.popleft()

    def allow_connection(self, tenant_slug: str) -> bool:
        settings = get_settings()
        window = self._connection_attempts[tenant_slug]
        self._prune(window, 60.0)
        if len(window) >= settings.ws_connection_rate_per_minute:
            return False
        window.append(time.monotonic())
        return True

    def allow_message(self, websocket: WebSocket) -> bool:
        settings = get_settings()
        window = self._message_times.setdefault(websocket, deque())
        self._prune(window, 60.0)
        if len(window) >= settings.ws_message_rate_per_minute:
            return False
        window.append(time.monotonic())
        return True

    def clear_socket(self, websocket: WebSocket) -> None:
        self._message_times.pop(websocket, None)


rate_limiter = WSRateLimiter()
