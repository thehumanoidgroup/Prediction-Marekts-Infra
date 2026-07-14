"""High-level Kalshi market service with normalization and Redis caching.

Fetches raw Trading API data via :class:`KalshiClient`, normalizes it into the
same camelCase shape used by LMSR and Polymarket markets, and caches live
prices in Redis when available.
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import redis.asyncio as aioredis

from app.core.config import Settings, get_settings
from app.runtime.catalog import DAY_MS

from .exceptions import KalshiError
from .kalshi_client import KalshiClient

logger = logging.getLogger(__name__)

CACHE_PREFIX = "pp:kalshi:"
CACHE_ALL_MARKETS = f"{CACHE_PREFIX}markets:all"
CACHE_ACTIVE_MARKETS = f"{CACHE_PREFIX}markets:active"
CACHE_MARKET_PREFIX = f"{CACHE_PREFIX}market:"
CACHE_ORDERBOOK_PREFIX = f"{CACHE_PREFIX}orderbook:"
CACHE_PRICE_PREFIX = f"{CACHE_PREFIX}price:"

_TAG_CATEGORY_MAP: dict[str, str] = {
    "crypto": "crypto",
    "btc": "crypto",
    "eth": "crypto",
    "xrp": "crypto",
    "sport": "economics",
    "nba": "economics",
    "nfl": "economics",
    "fed": "economics",
    "cpi": "economics",
    "gdp": "economics",
    "election": "economics",
    "pres": "economics",
    "weather": "commodities",
    "temp": "commodities",
}

_KEYWORD_CATEGORY_MAP: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(btc|bitcoin|eth|ethereum|crypto|solana|xrp)\b", re.I), "crypto"),
    (re.compile(r"\b(nvda|aapl|tsla|stock|equity|ipo|s&p|nasdaq)\b", re.I), "stocks"),
    (re.compile(r"\b(fed|cpi|inflation|gdp|fomc|rate cut)\b", re.I), "economics"),
    (re.compile(r"\b(election|president|senate|congress|vote)\b", re.I), "economics"),
    (re.compile(r"\b(nba|nfl|mlb|soccer|sport|game|match)\b", re.I), "economics"),
    (re.compile(r"\b(weather|temperature|rain|hurricane)\b", re.I), "commodities"),
]


def _now_ms() -> int:
    return int(time.time() * 1000)


def _clamp_price(price: float) -> float:
    return min(0.97, max(0.03, price))


def _parse_iso_ms(value: str | None) -> int | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except ValueError:
        return None


def _parse_dollar_price(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _internal_market_id(ticker: str) -> str:
    return f"kalshi-{ticker.upper()}"


def _strip_internal_prefix(market_id: str) -> str:
    if market_id.lower().startswith("kalshi-"):
        return market_id.removeprefix("kalshi-").removeprefix("KALSHI-")
    return market_id


def _infer_category(raw: dict[str, Any]) -> str:
    series = str(raw.get("series_ticker") or "").lower()
    event = str(raw.get("event_ticker") or "").lower()
    title = str(raw.get("title") or "").lower()
    haystack = f"{series} {event} {title}"

    for token in re.split(r"[^a-z0-9]+", haystack):
        if token in _TAG_CATEGORY_MAP:
            return _TAG_CATEGORY_MAP[token]

    for pattern, category in _KEYWORD_CATEGORY_MAP:
        if pattern.search(haystack):
            return category
    return "economics"


def _yes_price_from_market(raw: dict[str, Any]) -> float:
    last = _parse_dollar_price(raw.get("last_price_dollars"))
    if last is not None and last > 0:
        return _clamp_price(last)

    yes_bid = _parse_dollar_price(raw.get("yes_bid_dollars"))
    yes_ask = _parse_dollar_price(raw.get("yes_ask_dollars"))
    if yes_bid is not None and yes_ask is not None and (yes_bid > 0 or yes_ask > 0):
        if yes_bid > 0 and yes_ask > 0:
            return _clamp_price((yes_bid + yes_ask) / 2)
        return _clamp_price(yes_bid or yes_ask)

    return 0.5


def _market_status(raw: dict[str, Any], closes_at: int) -> str:
    status = str(raw.get("status") or "").lower()
    if status in {"closed", "settled", "finalized", "determined"}:
        return "resolved"
    remaining = closes_at - _now_ms()
    if remaining <= 0:
        return "resolved"
    if remaining < 14 * DAY_MS:
        return "closing_soon"
    return "open"


def normalize_kalshi_market(raw: dict[str, Any]) -> dict[str, Any]:
    """Map a raw Kalshi market into PropPredict's unified market JSON shape."""
    ticker = str(raw.get("ticker") or "").strip()
    if not ticker:
        raise KalshiError("Kalshi market is missing ticker.")

    yes_price = _yes_price_from_market(raw)
    closes_at = _parse_iso_ms(raw.get("close_time")) or (_now_ms() + 30 * DAY_MS)
    status = _market_status(raw, closes_at)
    now = _now_ms()

    volume = _parse_dollar_price(raw.get("volume_fp")) or 0.0
    volume_24h = _parse_dollar_price(raw.get("volume_24h_fp")) or 0.0
    open_interest = _parse_dollar_price(raw.get("open_interest_fp")) or 0.0

    normalized: dict[str, Any] = {
        "id": _internal_market_id(ticker),
        "question": str(raw.get("title") or "Untitled Kalshi market"),
        "category": _infer_category(raw),
        "status": status,
        "yesPrice": yes_price,
        "change24h": 0.0,
        "volume": volume,
        "volume24h": volume_24h,
        "openInterest": open_interest,
        "traders": 0,
        "closesAt": closes_at,
        "history": [{"t": now, "p": yes_price}],
        "source": "kalshi",
        "externalTicker": ticker,
        "eventTicker": raw.get("event_ticker"),
        "seriesTicker": raw.get("series_ticker"),
        "acceptingOrders": status in {"open", "closing_soon"},
        "outcomes": [
            {
                "label": "Yes",
                "price": yes_price,
            },
            {
                "label": "No",
                "price": _clamp_price(1.0 - yes_price),
            },
        ],
    }

    subtitle = raw.get("subtitle") or raw.get("yes_sub_title")
    if subtitle:
        normalized["subtitle"] = subtitle

    result = raw.get("result")
    if result:
        normalized["resolvedOutcome"] = str(result).lower()

    return normalized


def _matches_query(market: dict[str, Any], query: str) -> bool:
    needle = query.strip().lower()
    if not needle:
        return True

    fields = [
        market.get("question", ""),
        market.get("subtitle") or "",
        market.get("category", ""),
        market.get("id", ""),
        market.get("externalTicker", ""),
        market.get("eventTicker") or "",
        market.get("seriesTicker") or "",
    ]
    return any(needle in str(value).lower() for value in fields)


def _midpoint_from_orderbook(orderbook: dict[str, Any]) -> float | None:
    book = orderbook.get("orderbook_fp") or orderbook.get("orderbook") or orderbook
    yes_levels = book.get("yes_dollars") or book.get("yes") or []
    if not yes_levels:
        return None

    best = yes_levels[0]
    if isinstance(best, (list, tuple)) and best:
        price = _parse_dollar_price(best[0])
        if price is not None:
            return _clamp_price(price)
    return None


class KalshiService:
    """Cached Kalshi market access layer for PropPredict."""

    def __init__(
        self,
        client: KalshiClient,
        *,
        redis_url: str,
        cache_ttl_seconds: float = 300.0,
        list_cache_ttl_seconds: float = 600.0,
        price_cache_ttl_seconds: float = 30.0,
        max_fetch_pages: int | None = 10,
    ) -> None:
        self._client = client
        self._redis_url = redis_url
        self._cache_ttl = cache_ttl_seconds
        self._list_cache_ttl = list_cache_ttl_seconds
        self._price_cache_ttl = price_cache_ttl_seconds
        self._max_fetch_pages = max_fetch_pages
        self._redis: aioredis.Redis | None = None
        self._redis_checked = False
        self._local_cache: dict[str, tuple[float, Any]] = {}

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> KalshiService:
        cfg = settings or get_settings()
        return cls(
            KalshiClient.from_settings(cfg),
            redis_url=cfg.redis_url,
            cache_ttl_seconds=cfg.kalshi_cache_ttl_seconds,
            list_cache_ttl_seconds=cfg.kalshi_list_cache_ttl_seconds,
            price_cache_ttl_seconds=cfg.kalshi_price_cache_ttl_seconds,
            max_fetch_pages=cfg.kalshi_max_fetch_pages,
        )

    async def get_all_markets(self, *, refresh: bool = False) -> list[dict[str, Any]]:
        if not refresh:
            cached = await self._cache_get(CACHE_ALL_MARKETS)
            if cached is not None:
                return list(cached)

        raw_markets = await self._fetch_all_raw_markets()
        normalized = [normalize_kalshi_market(item) for item in raw_markets]
        await self._cache_set(CACHE_ALL_MARKETS, normalized, ttl=self._list_cache_ttl)
        return normalized

    async def get_active_markets(self, *, refresh: bool = False) -> list[dict[str, Any]]:
        if not refresh:
            cached = await self._cache_get(CACHE_ACTIVE_MARKETS)
            if cached is not None:
                return list(cached)

        all_markets = await self.get_all_markets(refresh=refresh)
        active = [
            market
            for market in all_markets
            if market.get("acceptingOrders")
            and market.get("status") in {"open", "closing_soon"}
        ]
        await self._cache_set(CACHE_ACTIVE_MARKETS, active, ttl=self._cache_ttl)
        return active

    async def get_market_by_id(self, market_id: str) -> dict[str, Any] | None:
        if not market_id:
            raise KalshiError("market_id is required.")

        ticker = _strip_internal_prefix(market_id)
        cache_key = f"{CACHE_MARKET_PREFIX}{ticker.upper()}"

        cached = await self._cache_get(cache_key)
        if cached is not None:
            return dict(cached)

        for market in await self.get_all_markets():
            if str(market.get("externalTicker", "")).upper() == ticker.upper():
                await self._cache_set(cache_key, market, ttl=self._cache_ttl)
                return market
            if market.get("id", "").lower() == market_id.lower():
                await self._cache_set(cache_key, market, ttl=self._cache_ttl)
                return market

        try:
            raw = await self._client.get_market(ticker)
        except KalshiError:
            return None

        normalized = normalize_kalshi_market(raw)
        await self._cache_set(cache_key, normalized, ttl=self._cache_ttl)
        return normalized

    async def search_markets(self, query: str, *, refresh: bool = False) -> list[dict[str, Any]]:
        markets = await self.get_all_markets(refresh=refresh)
        return [market for market in markets if _matches_query(market, query)]

    async def get_orderbook(self, market_ticker: str, *, refresh: bool = False) -> dict[str, Any]:
        ticker = _strip_internal_prefix(market_ticker).upper()
        cache_key = f"{CACHE_ORDERBOOK_PREFIX}{ticker}"

        if not refresh:
            cached = await self._cache_get(cache_key, ttl=self._price_cache_ttl)
            if cached is not None:
                return dict(cached)

        orderbook = await self._client.get_orderbook(ticker)
        await self._cache_set(cache_key, orderbook, ttl=self._price_cache_ttl)
        return orderbook

    async def get_live_price(self, market_ticker: str, *, refresh: bool = False) -> float:
        """Return a cached live YES price, preferring orderbook midpoint."""
        ticker = _strip_internal_prefix(market_ticker).upper()
        cache_key = f"{CACHE_PRICE_PREFIX}{ticker}"

        if not refresh:
            cached = await self._cache_get(cache_key, ttl=self._price_cache_ttl)
            if cached is not None:
                return float(cached)

        try:
            orderbook = await self.get_orderbook(ticker, refresh=True)
            midpoint = _midpoint_from_orderbook(orderbook)
            if midpoint is not None:
                await self._cache_set(cache_key, midpoint, ttl=self._price_cache_ttl)
                return midpoint
        except KalshiError:
            logger.debug("Kalshi orderbook unavailable for %s; falling back to market", ticker)

        market = await self.get_market_by_id(ticker)
        if market is None:
            raise KalshiError(f"Kalshi market '{ticker}' not found.")
        price = float(market.get("yesPrice") or 0.5)
        await self._cache_set(cache_key, price, ttl=self._price_cache_ttl)
        return price

    async def invalidate_cache(self) -> None:
        self._local_cache.clear()
        redis = await self._get_redis()
        if redis is None:
            return

        try:
            keys = [key async for key in redis.scan_iter(match=f"{CACHE_PREFIX}*")]
            if keys:
                await redis.delete(*keys)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to invalidate Kalshi Redis cache")

    async def get_integration_status(self) -> dict[str, Any]:
        started = time.monotonic()
        status: dict[str, Any] = {
            "provider": "kalshi",
            "enabled": True,
            "baseUrl": self._client.base_url,
            "authMode": self._client.auth_mode,
            "hasApiCredentials": self._client.is_authenticated,
            "redis": "unavailable",
            "api": "unknown",
            "marketSampleSize": None,
            "latencyMs": None,
            "cachedMarketCount": None,
            "error": None,
        }

        redis = await self._get_redis()
        status["redis"] = "connected" if redis is not None else "unavailable"

        cached = await self._cache_get(CACHE_ALL_MARKETS)
        if isinstance(cached, list):
            status["cachedMarketCount"] = len(cached)

        try:
            page = await self._client.get_markets(limit=1, status="open")
            status["api"] = "connected"
            status["marketSampleSize"] = len(page.markets)
            status["latencyMs"] = round((time.monotonic() - started) * 1000, 1)
        except KalshiError as exc:
            status["api"] = "error"
            status["error"] = str(exc)
            status["latencyMs"] = round((time.monotonic() - started) * 1000, 1)

        status["healthy"] = status["api"] == "connected"
        return status

    async def close(self) -> None:
        await self._client.aclose()
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
            self._redis_checked = False

    @property
    def client(self) -> KalshiClient:
        return self._client

    async def _fetch_all_raw_markets(self) -> list[dict[str, Any]]:
        markets: list[dict[str, Any]] = []
        async for market in self._client.iter_markets(
            status="open",
            max_pages=self._max_fetch_pages,
        ):
            markets.append(market)
        logger.info("Fetched %s Kalshi markets from Trading API", len(markets))
        return markets

    async def _get_redis(self) -> aioredis.Redis | None:
        if self._redis_checked:
            return self._redis

        self._redis_checked = True
        try:
            self._redis = aioredis.from_url(
                self._redis_url,
                socket_connect_timeout=2,
                decode_responses=True,
            )
            await self._redis.ping()
            logger.info("Kalshi service connected to Redis")
        except Exception:  # noqa: BLE001
            self._redis = None
            logger.warning("Redis unavailable — Kalshi cache is in-process only")
        return self._redis

    async def _cache_get(self, key: str, *, ttl: float | None = None) -> Any | None:
        effective_ttl = ttl or self._cache_ttl
        now = time.monotonic()
        local = self._local_cache.get(key)
        if local and local[0] > now:
            return local[1]
        if local:
            self._local_cache.pop(key, None)

        redis = await self._get_redis()
        if redis is None:
            return None

        try:
            raw = await redis.get(key)
        except Exception:  # noqa: BLE001
            logger.exception("Kalshi Redis GET failed for %s", key)
            return None

        if raw is None:
            return None

        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            return None

        self._local_cache[key] = (now + effective_ttl, value)
        return value

    async def _cache_set(self, key: str, value: Any, *, ttl: float | None = None) -> None:
        effective_ttl = ttl or self._cache_ttl
        expires = time.monotonic() + effective_ttl
        self._local_cache[key] = (expires, value)

        redis = await self._get_redis()
        if redis is None:
            return

        try:
            await redis.set(key, json.dumps(value), ex=int(effective_ttl))
        except Exception:  # noqa: BLE001
            logger.exception("Kalshi Redis SET failed for %s", key)


@lru_cache
def get_kalshi_service() -> KalshiService:
    """Process-wide Kalshi service singleton."""
    return KalshiService.from_settings()


__all__ = [
    "KalshiService",
    "get_kalshi_service",
    "normalize_kalshi_market",
]
