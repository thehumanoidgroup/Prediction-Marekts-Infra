"""High-level Polymarket market service with normalization and Redis caching.

Fetches raw CLOB market data via :class:`PolymarketClient`, normalizes it into
the same camelCase shape used by LMSR markets (``serialize_market``), and
caches responses in Redis when available.
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

from .exceptions import PolymarketError
from .polymarket_client import PolymarketClient

logger = logging.getLogger(__name__)

CACHE_PREFIX = "pp:polymarket:"
CACHE_ALL_MARKETS = f"{CACHE_PREFIX}markets:all"
CACHE_ACTIVE_MARKETS = f"{CACHE_PREFIX}markets:active"
CACHE_MARKET_PREFIX = f"{CACHE_PREFIX}market:"

# PropPredict ``MarketCategory`` values (frontend ``types.ts``).
INTERNAL_CATEGORIES = frozenset(
    {"crypto", "stocks", "forex", "commodities", "economics", "indices"}
)

_TAG_CATEGORY_MAP: dict[str, str] = {
    "crypto": "crypto",
    "bitcoin": "crypto",
    "ethereum": "crypto",
    "defi": "crypto",
    "stocks": "stocks",
    "equities": "stocks",
    "forex": "forex",
    "fx": "forex",
    "commodities": "commodities",
    "oil": "commodities",
    "gold": "commodities",
    "economics": "economics",
    "fed": "economics",
    "inflation": "economics",
    "macro": "economics",
    "politics": "economics",
    "elections": "economics",
    "indices": "indices",
    "s&p": "indices",
    "nasdaq": "indices",
}

_KEYWORD_CATEGORY_MAP: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(btc|bitcoin|eth|ethereum|crypto|solana|defi)\b", re.I), "crypto"),
    (re.compile(r"\b(nvda|aapl|tsla|stock|equity|ipo)\b", re.I), "stocks"),
    (re.compile(r"\b(eur/usd|usd/jpy|forex|fx)\b", re.I), "forex"),
    (re.compile(r"\b(oil|wti|gold|crude|commodity)\b", re.I), "commodities"),
    (re.compile(r"\b(s&p|nasdaq|dow|vix|index)\b", re.I), "indices"),
    (re.compile(r"\b(fed|cpi|inflation|unemployment|gdp|fomc)\b", re.I), "economics"),
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


def _internal_market_id(condition_id: str) -> str:
    return f"poly-{condition_id.lower()}"


def _strip_internal_prefix(market_id: str) -> str:
    if market_id.startswith("poly-"):
        return market_id.removeprefix("poly-")
    return market_id


def _infer_category(raw: dict[str, Any]) -> str:
    tags = [str(tag).lower() for tag in (raw.get("tags") or [])]
    for tag in tags:
        mapped = _TAG_CATEGORY_MAP.get(tag)
        if mapped:
            return mapped
        for key, category in _TAG_CATEGORY_MAP.items():
            if key in tag:
                return category

    haystack = " ".join(
        [
            str(raw.get("question") or ""),
            str(raw.get("description") or ""),
            str(raw.get("market_slug") or ""),
            " ".join(tags),
        ]
    )
    for pattern, category in _KEYWORD_CATEGORY_MAP:
        if pattern.search(haystack):
            return category
    return "economics"


def _market_status(raw: dict[str, Any], closes_at: int) -> str:
    if raw.get("closed") or raw.get("archived") or not raw.get("active", True):
        return "resolved"
    remaining = closes_at - _now_ms()
    if remaining <= 0:
        return "resolved"
    if remaining < 14 * DAY_MS:
        return "closing_soon"
    return "open"


def _yes_price_from_tokens(tokens: list[dict[str, Any]]) -> float:
    if not tokens:
        return 0.5

    for token in tokens:
        outcome = str(token.get("outcome") or "").strip().lower()
        if outcome in {"yes", "y"}:
            return _clamp_price(float(token.get("price") or 0.5))

    for token in tokens:
        outcome = str(token.get("outcome") or "").strip().lower()
        if outcome not in {"no", "n"}:
            return _clamp_price(float(token.get("price") or 0.5))

    return _clamp_price(float(tokens[0].get("price") or 0.5))


def _resolved_outcome(tokens: list[dict[str, Any]]) -> str | None:
    winner = next((token for token in tokens if token.get("winner")), None)
    if winner is None:
        return None
    outcome = str(winner.get("outcome") or "").strip().lower()
    if outcome in {"yes", "y"}:
        return "yes"
    if outcome in {"no", "n"}:
        return "no"
    return None


def normalize_polymarket_market(raw: dict[str, Any]) -> dict[str, Any]:
    """Map a raw Polymarket CLOB market into PropPredict's market JSON shape.

    The returned dict mirrors :func:`app.runtime.serializers.serialize_market`
    so Polymarket listings can render beside LMSR markets, with a few optional
    metadata fields prefixed for external-source consumers.
    """
    condition_id = str(raw.get("condition_id") or raw.get("conditionId") or "").strip()
    if not condition_id:
        raise PolymarketError("Polymarket market is missing condition_id.")

    tokens = list(raw.get("tokens") or [])
    yes_price = _yes_price_from_tokens(tokens)
    closes_at = _parse_iso_ms(raw.get("end_date_iso")) or (_now_ms() + 30 * DAY_MS)
    status = _market_status(raw, closes_at)
    now = _now_ms()

    normalized: dict[str, Any] = {
        "id": _internal_market_id(condition_id),
        "question": str(raw.get("question") or "Untitled Polymarket market"),
        "category": _infer_category(raw),
        "status": status,
        "yesPrice": yes_price,
        "change24h": 0.0,
        "volume": 0.0,
        "volume24h": 0.0,
        "openInterest": 0.0,
        "traders": 0,
        "closesAt": closes_at,
        "history": [{"t": now, "p": yes_price}],
        "source": "polymarket",
        "externalConditionId": condition_id,
        "marketSlug": raw.get("market_slug"),
        "acceptingOrders": bool(raw.get("accepting_orders")),
        "outcomes": [
            {
                "tokenId": token.get("token_id"),
                "label": token.get("outcome"),
                "price": float(token.get("price") or 0.0),
                "winner": bool(token.get("winner")),
            }
            for token in tokens
        ],
    }

    resolved = _resolved_outcome(tokens)
    if resolved is not None:
        normalized["resolvedOutcome"] = resolved

    return normalized


def _matches_query(market: dict[str, Any], query: str) -> bool:
    needle = query.strip().lower()
    if not needle:
        return True

    fields = [
        market.get("question", ""),
        market.get("marketSlug") or "",
        market.get("category", ""),
        market.get("id", ""),
        market.get("externalConditionId", ""),
    ]
    fields.extend(
        str(outcome.get("label") or "")
        for outcome in (market.get("outcomes") or [])
    )
    return any(needle in str(value).lower() for value in fields)


class PolymarketService:
    """Cached Polymarket market access layer for PropPredict.

    Example
    -------
    Basic read-only usage::

        service = get_polymarket_service()
        markets = await service.get_active_markets()
        one = await service.get_market_by_id("poly-0x...")

    Search with cache refresh::

        results = await service.search_markets("bitcoin", refresh=True)

    Operator health check::

        status = await service.get_integration_status()
        assert status["healthy"]

    Authenticated trading (requires ``PP_POLYMARKET_PRIVATE_KEY``)::

        service = get_polymarket_service()
        await service.ensure_authenticated()
        # downstream trading endpoints can use service.client.can_trade
    """

    def __init__(
        self,
        client: PolymarketClient,
        *,
        redis_url: str,
        cache_ttl_seconds: float = 300.0,
        list_cache_ttl_seconds: float = 600.0,
        max_fetch_pages: int | None = 10,
    ) -> None:
        self._client = client
        self._redis_url = redis_url
        self._cache_ttl = cache_ttl_seconds
        self._list_cache_ttl = list_cache_ttl_seconds
        self._max_fetch_pages = max_fetch_pages
        self._redis: aioredis.Redis | None = None
        self._redis_checked = False
        self._local_cache: dict[str, tuple[float, Any]] = {}

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> PolymarketService:
        cfg = settings or get_settings()
        return cls(
            PolymarketClient.from_settings(cfg),
            redis_url=cfg.redis_url,
            cache_ttl_seconds=cfg.polymarket_cache_ttl_seconds,
            list_cache_ttl_seconds=cfg.polymarket_list_cache_ttl_seconds,
            max_fetch_pages=cfg.polymarket_max_fetch_pages,
        )

    async def get_all_markets(self, *, refresh: bool = False) -> list[dict[str, Any]]:
        """Return all normalized Polymarket markets (cached, paginated upstream)."""
        if not refresh:
            cached = await self._cache_get(CACHE_ALL_MARKETS)
            if cached is not None:
                return list(cached)

        raw_markets = await self._fetch_all_raw_markets()
        normalized = [normalize_polymarket_market(item) for item in raw_markets]
        await self._cache_set(CACHE_ALL_MARKETS, normalized, ttl=self._list_cache_ttl)
        return normalized

    async def get_active_markets(self, *, refresh: bool = False) -> list[dict[str, Any]]:
        """Return normalized markets that are open and accepting orders."""
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
        """Fetch a single market by internal id (``poly-0x…``) or condition id."""
        if not market_id:
            raise PolymarketError("market_id is required.")

        condition_id = _strip_internal_prefix(market_id)
        cache_key = f"{CACHE_MARKET_PREFIX}{condition_id.lower()}"

        cached = await self._cache_get(cache_key)
        if cached is not None:
            return dict(cached)

        # Fast path: already loaded in the full-list cache.
        for market in await self.get_all_markets():
            if market.get("externalConditionId", "").lower() == condition_id.lower():
                await self._cache_set(cache_key, market, ttl=self._cache_ttl)
                return market
            if market.get("id", "").lower() == market_id.lower():
                await self._cache_set(cache_key, market, ttl=self._cache_ttl)
                return market

        try:
            raw = await self._client.get_market(condition_id)
        except PolymarketError:
            return None

        normalized = normalize_polymarket_market(raw)
        await self._cache_set(cache_key, normalized, ttl=self._cache_ttl)
        return normalized

    async def search_markets(self, query: str, *, refresh: bool = False) -> list[dict[str, Any]]:
        """Case-insensitive search across question, slug, category, and outcomes."""
        markets = await self.get_all_markets(refresh=refresh)
        return [market for market in markets if _matches_query(market, query)]

    async def ensure_authenticated(self) -> None:
        """Derive L2 API credentials from ``PP_POLYMARKET_PRIVATE_KEY`` when needed.

        No-op when API credentials are already configured or no private key is set.
        Raises :class:`PolymarketAuthError` when a private key is present but
        credential derivation fails.
        """
        if self._client.is_authenticated or not self._client.has_wallet:
            return
        await self._client.authenticate()

    @property
    def client(self) -> PolymarketClient:
        """Underlying async CLOB client."""
        return self._client

    async def invalidate_cache(self) -> None:
        """Clear Polymarket cache entries (Redis + in-process fallback)."""
        self._local_cache.clear()
        redis = await self._get_redis()
        if redis is None:
            return

        try:
            keys = [key async for key in redis.scan_iter(match=f"{CACHE_PREFIX}*")]
            if keys:
                await redis.delete(*keys)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to invalidate Polymarket Redis cache")

    async def get_integration_status(self) -> dict[str, Any]:
        """Return a health snapshot for operators (CLOB reachability, cache, auth).

        Probes the Polymarket CLOB with a lightweight ``get_markets`` call and
        reports Redis cache availability. Safe to expose on an admin dashboard.
        """
        import time

        from py_clob_client_v2.constants import L0, L1, L2

        auth_labels = {L0: "public", L1: "wallet", L2: "trading"}
        started = time.monotonic()

        status: dict[str, Any] = {
            "provider": "polymarket",
            "enabled": True,
            "host": self._client.host,
            "chainId": self._client.chain_id,
            "authLevel": self._client.auth_level,
            "authMode": auth_labels.get(self._client.auth_level, "unknown"),
            "hasWallet": self._client.has_wallet,
            "hasApiCredentials": self._client.is_authenticated,
            "canTrade": self._client.can_trade,
            "redis": "unavailable",
            "clob": "unknown",
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
            page = await self._client.get_markets()
            status["clob"] = "connected"
            status["marketSampleSize"] = len(page.data)
            status["latencyMs"] = round((time.monotonic() - started) * 1000, 1)
        except PolymarketError as exc:
            status["clob"] = "error"
            status["error"] = str(exc)
            status["latencyMs"] = round((time.monotonic() - started) * 1000, 1)

        status["healthy"] = status["clob"] == "connected"
        return status

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
            self._redis_checked = False

    async def _fetch_all_raw_markets(self) -> list[dict[str, Any]]:
        markets: list[dict[str, Any]] = []
        async for market in self._client.iter_markets(max_pages=self._max_fetch_pages):
            markets.append(market)
        logger.info("Fetched %s Polymarket markets from CLOB", len(markets))
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
            logger.info("Polymarket service connected to Redis")
        except Exception:  # noqa: BLE001
            self._redis = None
            logger.warning("Redis unavailable — Polymarket cache is in-process only")
        return self._redis

    async def _cache_get(self, key: str) -> Any | None:
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
            logger.exception("Polymarket Redis GET failed for %s", key)
            return None

        if raw is None:
            return None

        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            return None

        self._local_cache[key] = (now + self._cache_ttl, value)
        return value

    async def _cache_set(self, key: str, value: Any, *, ttl: float | None = None) -> None:
        expires = time.monotonic() + (ttl or self._cache_ttl)
        self._local_cache[key] = (expires, value)

        redis = await self._get_redis()
        if redis is None:
            return

        try:
            await redis.set(key, json.dumps(value), ex=int(ttl or self._cache_ttl))
        except Exception:  # noqa: BLE001
            logger.exception("Polymarket Redis SET failed for %s", key)


@lru_cache
def get_polymarket_service() -> PolymarketService:
    """Process-wide Polymarket service singleton."""
    return PolymarketService.from_settings()


__all__ = [
    "PolymarketService",
    "get_polymarket_service",
    "normalize_polymarket_market",
]
