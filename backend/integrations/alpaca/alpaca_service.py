"""Cached Alpaca S&P 500 market-data service (Redis + in-process fallback).

Wraps :class:`AlpacaClient` with TTLs suitable for the free IEX tier.

Replace with Polygon.io client when scaling — keep this façade's method names
stable so PropPredict market/resolution code can swap providers behind env flags.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime
from functools import lru_cache
from typing import Any

import redis.asyncio as aioredis

from app.core.config import Settings, get_settings

from .alpaca_client import AlpacaClient
from .exceptions import AlpacaError
from .sp500_tickers import SP500_TICKERS

logger = logging.getLogger(__name__)

CACHE_PREFIX = "pp:alpaca:"
CACHE_SP500 = f"{CACHE_PREFIX}sp500:tickers"
CACHE_PRICE_PREFIX = f"{CACHE_PREFIX}price:"
CACHE_SNAPSHOT_PREFIX = f"{CACHE_PREFIX}snapshot:"
CACHE_SNAPSHOTS_ALL = f"{CACHE_PREFIX}snapshots:sp500"
CACHE_BARS_PREFIX = f"{CACHE_PREFIX}bars:"


class AlpacaService:
    """High-level S&P 500 helpers with Redis caching and graceful degradation."""

    def __init__(
        self,
        client: AlpacaClient,
        *,
        redis_url: str,
        cache_ttl_seconds: float = 60.0,
        price_cache_ttl_seconds: float = 15.0,
        list_cache_ttl_seconds: float = 86_400.0,
        bars_cache_ttl_seconds: float = 3_600.0,
    ) -> None:
        self._client = client
        self._redis_url = redis_url
        self._cache_ttl = cache_ttl_seconds
        self._price_cache_ttl = price_cache_ttl_seconds
        self._list_cache_ttl = list_cache_ttl_seconds
        self._bars_cache_ttl = bars_cache_ttl_seconds
        self._redis: aioredis.Redis | None = None
        self._redis_checked = False
        self._local_cache: dict[str, tuple[float, Any]] = {}

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> AlpacaService:
        cfg = settings or get_settings()
        return cls(
            AlpacaClient.from_settings(cfg),
            redis_url=cfg.redis_url,
            cache_ttl_seconds=cfg.alpaca_cache_ttl_seconds,
            price_cache_ttl_seconds=cfg.alpaca_price_cache_ttl_seconds,
            list_cache_ttl_seconds=cfg.alpaca_list_cache_ttl_seconds,
            bars_cache_ttl_seconds=cfg.alpaca_bars_cache_ttl_seconds,
        )

    @property
    def client(self) -> AlpacaClient:
        return self._client

    async def get_sp500_tickers(self, *, refresh: bool = False) -> list[str]:
        """Cached S&P 500 ticker universe for MVP stock markets."""
        if not refresh:
            cached = await self._cache_get(CACHE_SP500)
            if cached is not None:
                return list(cached)

        tickers = self._client.get_sp500_tickers()
        await self._cache_set(CACHE_SP500, tickers, ttl=self._list_cache_ttl)
        return tickers

    async def get_current_price(self, ticker: str, *, refresh: bool = False) -> float:
        symbol = ticker.strip().upper()
        cache_key = f"{CACHE_PRICE_PREFIX}{symbol}"
        if not refresh:
            cached = await self._cache_get(cache_key)
            if cached is not None:
                return float(cached)

        price = await self._client.get_current_price(symbol)
        await self._cache_set(cache_key, price, ttl=self._price_cache_ttl)
        return price

    async def get_snapshot(self, ticker: str, *, refresh: bool = False) -> dict[str, Any]:
        symbol = ticker.strip().upper()
        cache_key = f"{CACHE_SNAPSHOT_PREFIX}{symbol}"
        if not refresh:
            cached = await self._cache_get(cache_key)
            if isinstance(cached, dict):
                return cached

        snapshot = await self._client.get_snapshot(symbol)
        await self._cache_set(cache_key, snapshot, ttl=self._price_cache_ttl)
        return snapshot

    async def get_snapshots_all(
        self,
        tickers: list[str] | None = None,
        *,
        refresh: bool = False,
    ) -> dict[str, dict[str, Any]]:
        cache_key = CACHE_SNAPSHOTS_ALL if tickers is None else None
        if cache_key and not refresh:
            cached = await self._cache_get(cache_key)
            if isinstance(cached, dict):
                return {str(k).upper(): v for k, v in cached.items() if isinstance(v, dict)}

        snapshots = await self._client.get_snapshots_all(tickers)
        if cache_key:
            await self._cache_set(cache_key, snapshots, ttl=self._cache_ttl)
        return snapshots

    async def get_daily_bars(
        self,
        ticker: str,
        bar_date: date | datetime | str,
        *,
        refresh: bool = False,
    ) -> list[dict[str, Any]]:
        """Daily bars for settlement / market resolution."""
        symbol = ticker.strip().upper()
        day = (
            bar_date.date().isoformat()
            if isinstance(bar_date, datetime)
            else bar_date.isoformat()
            if isinstance(bar_date, date)
            else str(bar_date)[:10]
        )
        cache_key = f"{CACHE_BARS_PREFIX}{symbol}:{day}"
        if not refresh:
            cached = await self._cache_get(cache_key)
            if isinstance(cached, list):
                return cached

        bars = await self._client.get_daily_bars(symbol, bar_date)
        await self._cache_set(cache_key, bars, ttl=self._bars_cache_ttl)
        return bars

    async def get_status(self) -> dict[str, Any]:
        """Health payload for integrations / admin UI."""
        status: dict[str, Any] = {
            "provider": "alpaca",
            "feed": self._client.feed,
            "enabled": True,
            "healthy": False,
            "authMode": "authenticated",
            "redis": "unavailable",
            "api": "unknown",
            "sp500TickerCount": len(SP500_TICKERS),
            "marketSampleSize": None,
            "latencyMs": None,
            "error": None,
            "note": (
                "IEX free tier — replace with Polygon.io client when scaling "
                "(full SIP, higher rate limits)."
            ),
        }

        redis = await self._get_redis()
        status["redis"] = "connected" if redis is not None else "unavailable"

        started = time.perf_counter()
        try:
            # Probe with a highly liquid name on IEX.
            price = await self.get_current_price("AAPL", refresh=True)
            status["healthy"] = price > 0
            status["api"] = "connected"
            status["marketSampleSize"] = 1
            status["latencyMs"] = int((time.perf_counter() - started) * 1000)
        except Exception as exc:  # noqa: BLE001
            status["api"] = "error"
            status["error"] = str(exc)
            status["latencyMs"] = int((time.perf_counter() - started) * 1000)

        return status

    async def clear_cache(self) -> None:
        redis = await self._get_redis()
        self._local_cache.clear()
        if redis is None:
            return
        keys = [key async for key in redis.scan_iter(match=f"{CACHE_PREFIX}*")]
        if keys:
            await redis.delete(*keys)

    async def aclose(self) -> None:
        await self._client.aclose()
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
            self._redis_checked = False

    async def _get_redis(self) -> aioredis.Redis | None:
        if self._redis_checked:
            return self._redis
        self._redis_checked = True
        try:
            self._redis = aioredis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            await self._redis.ping()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Alpaca Redis unavailable (%s) — using in-process cache", exc)
            self._redis = None
        return self._redis

    async def _cache_get(self, key: str) -> Any | None:
        now = time.time()
        local = self._local_cache.get(key)
        if local is not None and local[0] > now:
            return local[1]

        redis = await self._get_redis()
        if redis is None:
            return None
        try:
            raw = await redis.get(key)
            if raw is None:
                return None
            value = json.loads(raw)
            self._local_cache[key] = (now + 5.0, value)
            return value
        except Exception as exc:  # noqa: BLE001
            logger.debug("Alpaca cache get failed for %s: %s", key, exc)
            return None

    async def _cache_set(self, key: str, value: Any, *, ttl: float) -> None:
        effective_ttl = max(1.0, float(ttl))
        self._local_cache[key] = (time.time() + effective_ttl, value)
        redis = await self._get_redis()
        if redis is None:
            return
        try:
            await redis.set(key, json.dumps(value), ex=int(effective_ttl))
        except Exception as exc:  # noqa: BLE001
            logger.debug("Alpaca cache set failed for %s: %s", key, exc)


@lru_cache
def get_alpaca_service() -> AlpacaService:
    """Process-wide Alpaca service singleton (settings-backed)."""
    return AlpacaService.from_settings()


__all__ = [
    "AlpacaService",
    "get_alpaca_service",
]
