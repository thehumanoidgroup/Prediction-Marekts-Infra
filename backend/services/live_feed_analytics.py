"""In-process analytics for live feed connections and event engagement."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any


@dataclass
class EventAnalytics:
    views: int = 0
    updates: int = 0
    last_view_at: float | None = None
    last_update_at: float | None = None
    stock_ticker: str | None = None


class LiveFeedAnalytics:
    """Tracks WebSocket fan-out and live event engagement metrics.

    Also maintains a **viewed ticker** registry used by the Alpaca quote bridge
    so we only subscribe to symbols that clients are currently looking at.
    """

    def __init__(self, *, ticker_ttl_seconds: float = 300.0) -> None:
        self._lock = threading.Lock()
        self._connections_by_tenant: dict[str, int] = defaultdict(int)
        self._total_connections = 0
        self._events: dict[str, EventAnalytics] = defaultdict(EventAnalytics)
        self._update_timestamps: deque[float] = deque(maxlen=5_000)
        self._started_at = time.time()
        # ticker → last viewed monotonic timestamp
        self._viewed_tickers: dict[str, float] = {}
        self._ticker_ttl_seconds = ticker_ttl_seconds

    def record_connection(self, tenant_slug: str, *, connected: bool) -> None:
        with self._lock:
            if connected:
                self._connections_by_tenant[tenant_slug] += 1
                self._total_connections += 1
            else:
                current = self._connections_by_tenant.get(tenant_slug, 0)
                if current > 0:
                    self._connections_by_tenant[tenant_slug] = current - 1
                if self._total_connections > 0:
                    self._total_connections -= 1

    def record_event_view(
        self,
        event_id: str,
        *,
        stock_ticker: str | None = None,
    ) -> None:
        now = time.time()
        ticker = (stock_ticker or "").strip().upper() or None
        with self._lock:
            entry = self._events[event_id]
            entry.views += 1
            entry.last_view_at = now
            if ticker:
                entry.stock_ticker = ticker
                self._viewed_tickers[ticker] = now

    def touch_ticker(self, ticker: str) -> None:
        """Mark a stock ticker as actively viewed (refreshes TTL)."""
        symbol = ticker.strip().upper()
        if not symbol:
            return
        with self._lock:
            self._viewed_tickers[symbol] = time.time()

    def active_tickers(self, *, max_symbols: int | None = None) -> list[str]:
        """Return recently viewed tickers, most-recent first (TTL expiry applied)."""
        now = time.time()
        with self._lock:
            expired = [
                symbol
                for symbol, seen_at in self._viewed_tickers.items()
                if now - seen_at > self._ticker_ttl_seconds
            ]
            for symbol in expired:
                self._viewed_tickers.pop(symbol, None)
            ranked = sorted(
                self._viewed_tickers.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        symbols = [symbol for symbol, _ in ranked]
        if max_symbols is not None and max_symbols > 0:
            return symbols[:max_symbols]
        return symbols

    def record_event_update(self, event_id: str) -> None:
        now = time.time()
        with self._lock:
            entry = self._events[event_id]
            entry.updates += 1
            entry.last_update_at = now
            self._update_timestamps.append(now)

    def updates_per_minute(self) -> float:
        now = time.time()
        with self._lock:
            recent = [ts for ts in self._update_timestamps if now - ts <= 60.0]
        return float(len(recent))

    def top_viewed_events(self, *, limit: int = 10) -> list[dict[str, Any]]:
        with self._lock:
            ranked = sorted(
                self._events.items(),
                key=lambda item: (item[1].views, item[1].updates),
                reverse=True,
            )
        return [
            {
                "event_id": event_id,
                "views": stats.views,
                "updates": stats.updates,
                "last_view_at": stats.last_view_at,
                "last_update_at": stats.last_update_at,
                "stock_ticker": stats.stock_ticker,
            }
            for event_id, stats in ranked[:limit]
        ]

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            tenants = {
                slug: count for slug, count in self._connections_by_tenant.items() if count > 0
            }
            total_events_tracked = len(self._events)
        return {
            "total_connections": self._total_connections,
            "connections_by_tenant": tenants,
            "updates_per_minute": round(self.updates_per_minute(), 2),
            "tracked_events": total_events_tracked,
            "active_sp500_tickers": self.active_tickers(),
            "uptime_seconds": round(time.time() - self._started_at),
            "top_viewed_events": self.top_viewed_events(),
        }


analytics = LiveFeedAnalytics()
