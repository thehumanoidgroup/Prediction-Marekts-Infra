"""In-process analytics for live feed connections and event engagement."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class EventAnalytics:
    views: int = 0
    updates: int = 0
    last_view_at: float | None = None
    last_update_at: float | None = None


class LiveFeedAnalytics:
    """Tracks WebSocket fan-out and live event engagement metrics."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._connections_by_tenant: dict[str, int] = defaultdict(int)
        self._total_connections = 0
        self._events: dict[str, EventAnalytics] = defaultdict(EventAnalytics)
        self._update_timestamps: deque[float] = deque(maxlen=5_000)
        self._started_at = time.time()

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

    def record_event_view(self, event_id: str) -> None:
        now = time.time()
        with self._lock:
            entry = self._events[event_id]
            entry.views += 1
            entry.last_view_at = now

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
            "uptime_seconds": round(time.time() - self._started_at),
            "top_viewed_events": self.top_viewed_events(),
        }


analytics = LiveFeedAnalytics()
