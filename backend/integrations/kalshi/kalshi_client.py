"""Async Kalshi Trading API client using httpx.

Kalshi exposes a public REST API for market data and an authenticated API for
portfolio and trading. This client supports both modes:

- **Public** — no credentials; ``get_markets``, ``get_market``, ``get_orderbook``
- **Authenticated** — RSA-PSS signed requests when ``PP_KALSHI_API_KEY`` and
  ``PP_KALSHI_API_SECRET`` (RSA private key PEM) are configured

Official docs: https://docs.kalshi.com/
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey

from app.core.config import Settings, get_settings

from integrations.polymarket.rate_limiter import AsyncRateLimiter

from .exceptions import (
    KalshiApiError,
    KalshiAuthError,
    KalshiError,
    KalshiRateLimitError,
    KalshiTimeoutError,
)

logger = logging.getLogger(__name__)

DEFAULT_PRODUCTION_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"
DEFAULT_DEMO_BASE_URL = "https://demo-api.kalshi.co/trade-api/v2"


def _resolve_credentials(
    *,
    api_key: str | None,
    api_secret: str | None,
) -> tuple[str | None, str | None]:
    """Validate API credential pairs loaded from ``PP_KALSHI_*`` env vars."""
    if any((api_key, api_secret)) and not all((api_key, api_secret)):
        logger.warning(
            "Incomplete Kalshi API credentials in environment — "
            "set PP_KALSHI_API_KEY and PP_KALSHI_API_SECRET together."
        )
        return None, None
    return api_key, api_secret


def _load_private_key(secret: str) -> RSAPrivateKey:
    """Load an RSA private key from PEM content or a filesystem path."""
    value = secret.strip()
    if value.startswith("-----BEGIN"):
        pem_data = value.encode("utf-8")
    else:
        key_path = Path(value).expanduser()
        if not key_path.is_file():
            raise KalshiAuthError(
                "PP_KALSHI_API_SECRET must be PEM content or a path to a .key file."
            )
        pem_data = key_path.read_bytes()

    try:
        loaded = serialization.load_pem_private_key(pem_data, password=None)
    except Exception as exc:  # noqa: BLE001
        raise KalshiAuthError(
            "Failed to load Kalshi RSA private key from PP_KALSHI_API_SECRET.",
            cause=exc,
        ) from exc

    if not isinstance(loaded, RSAPrivateKey):
        raise KalshiAuthError("Kalshi API secret must be an RSA private key.")
    return loaded


def _sign_message(private_key: RSAPrivateKey, message: bytes) -> str:
    try:
        signature = private_key.sign(
            message,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.DIGEST_LENGTH,
            ),
            hashes.SHA256(),
        )
    except Exception as exc:  # noqa: BLE001
        raise KalshiAuthError("Failed to sign Kalshi request.", cause=exc) from exc
    return base64.b64encode(signature).decode("utf-8")


@dataclass(frozen=True, slots=True)
class MarketsPage:
    """Normalized paginated markets response from the Kalshi Trading API."""

    markets: list[dict[str, Any]]
    cursor: str | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> MarketsPage:
        return cls(
            markets=list(payload.get("markets") or []),
            cursor=payload.get("cursor"),
        )


class KalshiClient:
    """Production async client for Kalshi's public Trading API.

    Parameters
    ----------
    base_url:
        API root including ``/trade-api/v2`` (production or demo).
    api_key:
        Kalshi API Key ID (UUID from account settings).
    api_secret:
        RSA private key PEM string or path to a ``.key`` file downloaded
        when the API key was created.
        """

    def __init__(
        self,
        *,
        base_url: str = DEFAULT_PRODUCTION_BASE_URL,
        api_key: str | None = None,
        api_secret: str | None = None,
        request_timeout_seconds: float = 30.0,
        rate_limit_per_minute: int = 60,
        max_retries: int = 3,
        retry_backoff_seconds: float = 0.5,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._timeout = request_timeout_seconds
        self._max_retries = max(0, max_retries)
        self._retry_backoff_seconds = retry_backoff_seconds
        api_key, api_secret = _resolve_credentials(api_key=api_key, api_secret=api_secret)
        self._api_key = api_key
        self._private_key: RSAPrivateKey | None = None
        if api_secret:
            self._private_key = _load_private_key(api_secret)
        self._rate_limiter = AsyncRateLimiter(
            max_requests=max(rate_limit_per_minute, 1),
            per_seconds=60.0,
        )
        self._http: httpx.AsyncClient | None = None

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> KalshiClient:
        """Build a client from ``PP_KALSHI_*`` application settings."""
        cfg = settings or get_settings()
        base_url = cfg.kalshi_demo_base_url if cfg.kalshi_use_demo else cfg.kalshi_base_url
        return cls(
            base_url=base_url,
            api_key=cfg.kalshi_api_key,
            api_secret=cfg.kalshi_api_secret,
            request_timeout_seconds=cfg.kalshi_request_timeout_seconds,
            rate_limit_per_minute=cfg.kalshi_rate_limit_per_minute,
            max_retries=cfg.kalshi_max_retries,
            retry_backoff_seconds=cfg.kalshi_retry_backoff_seconds,
        )

    @property
    def is_authenticated(self) -> bool:
        """True when API key id and RSA private key are configured."""
        return self._api_key is not None and self._private_key is not None

    @property
    def auth_mode(self) -> str:
        return "authenticated" if self.is_authenticated else "public"

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def _get_http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self._timeout,
                headers={"Accept": "application/json"},
            )
        return self._http

    def _signing_path(self, path: str) -> str:
        """Full URL path used for RSA-PSS signatures (no query string)."""
        parsed = urlparse(f"{self.base_url}{path}")
        return parsed.path.split("?")[0]

    def _auth_headers(self, method: str, path: str) -> dict[str, str]:
        if not self.is_authenticated:
            return {}

        timestamp = str(int(time.time() * 1000))
        sign_path = self._signing_path(path)
        message = f"{timestamp}{method.upper()}{sign_path}".encode("utf-8")
        signature = _sign_message(self._private_key, message)

        return {
            "KALSHI-ACCESS-KEY": self._api_key or "",
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
            "KALSHI-ACCESS-SIGNATURE": signature,
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        last_error: Exception | None = None
        client = await self._get_http()

        for attempt in range(self._max_retries + 1):
            await self._rate_limiter.acquire()
            headers = self._auth_headers(method, path)
            try:
                response = await client.request(
                    method,
                    path,
                    params=params,
                    json=json,
                    headers=headers or None,
                )
            except httpx.TimeoutException as exc:
                raise KalshiTimeoutError(
                    f"Kalshi request timed out after {self._timeout}s."
                ) from exc
            except httpx.HTTPError as exc:
                raise KalshiApiError(
                    "HTTP transport error while calling Kalshi.",
                    cause=exc,
                ) from exc

            if response.status_code == 429 and attempt < self._max_retries:
                backoff = self._retry_backoff_seconds * (2**attempt)
                retry_after = response.headers.get("Retry-After")
                if retry_after:
                    try:
                        backoff = max(backoff, float(retry_after))
                    except ValueError:
                        pass
                logger.warning(
                    "Kalshi rate limited (429); retrying in %.2fs (attempt %s/%s)",
                    backoff,
                    attempt + 1,
                    self._max_retries,
                )
                await asyncio.sleep(backoff)
                continue

            if response.status_code == 429:
                raise KalshiRateLimitError(
                    "Kalshi API rate limit exceeded.",
                    status_code=429,
                    error_payload=_safe_json(response),
                    cause=None,
                )

            if response.status_code == 401:
                raise KalshiAuthError(
                    "Kalshi authentication failed (401). Check API key and private key.",
                    cause=None,
                )

            if response.status_code >= 400:
                payload = _safe_json(response)
                message = _extract_error_message(payload) or response.reason_phrase
                raise KalshiApiError(
                    f"Kalshi API error: {message}",
                    status_code=response.status_code,
                    error_payload=payload,
                )

            try:
                data = response.json()
            except ValueError as exc:
                raise KalshiApiError(
                    "Kalshi returned a non-JSON response.",
                    status_code=response.status_code,
                    cause=exc,
                ) from exc

            if not isinstance(data, dict):
                raise KalshiApiError("Unexpected Kalshi response shape (expected object).")
            return data

        if last_error is not None:
            raise KalshiRateLimitError(
                "Kalshi API rate limit exceeded after retries.",
                status_code=429,
                cause=last_error,
            )
        raise KalshiError("Kalshi request failed after retries.")

    async def get_markets(
        self,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        status: str | None = None,
        event_ticker: str | None = None,
        series_ticker: str | None = None,
        tickers: str | None = None,
        min_close_ts: int | None = None,
        max_close_ts: int | None = None,
    ) -> MarketsPage:
        """Fetch a page of markets from ``GET /markets``.

        See https://docs.kalshi.com/api-reference/market/get-markets
        """
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if cursor:
            params["cursor"] = cursor
        if status:
            params["status"] = status
        if event_ticker:
            params["event_ticker"] = event_ticker
        if series_ticker:
            params["series_ticker"] = series_ticker
        if tickers:
            params["tickers"] = tickers
        if min_close_ts is not None:
            params["min_close_ts"] = min_close_ts
        if max_close_ts is not None:
            params["max_close_ts"] = max_close_ts

        payload = await self._request("GET", "/markets", params=params or None)
        return MarketsPage.from_payload(payload)

    async def iter_markets(
        self,
        *,
        limit: int = 200,
        status: str | None = "open",
        max_pages: int | None = 10,
        **filters: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        """Iterate market records, following Kalshi cursor pagination."""
        cursor: str | None = None
        pages = 0

        while True:
            page = await self.get_markets(
                limit=limit,
                cursor=cursor,
                status=status,
                **filters,
            )
            for market in page.markets:
                yield market

            if not page.cursor:
                break

            if max_pages is not None:
                pages += 1
                if pages >= max_pages:
                    break

            cursor = page.cursor

    async def get_market(self, market_ticker: str) -> dict[str, Any]:
        """Fetch a single market by ticker (``GET /markets/{ticker}``)."""
        ticker = market_ticker.strip()
        if not ticker:
            raise KalshiError("market_ticker is required.")

        payload = await self._request("GET", f"/markets/{ticker}")
        market = payload.get("market")
        if not isinstance(market, dict):
            raise KalshiApiError(
                f"Kalshi market '{ticker}' response is missing a market object."
            )
        return market

    async def get_orderbook(
        self,
        market_ticker: str,
        *,
        depth: int | None = None,
    ) -> dict[str, Any]:
        """Fetch the order book for a market (``GET /markets/{ticker}/orderbook``).

        Public endpoint — no authentication required. Returns Kalshi's
        ``orderbook_fp`` payload with ``yes_dollars`` and ``no_dollars`` bid
        ladders.
        """
        ticker = market_ticker.strip()
        if not ticker:
            raise KalshiError("market_ticker is required.")

        params: dict[str, Any] | None = None
        if depth is not None:
            params = {"depth": depth}

        return await self._request("GET", f"/markets/{ticker}/orderbook", params=params)

    async def search_markets(
        self,
        query: str,
        *,
        status: str | None = "open",
        limit: int = 200,
        max_pages: int | None = 5,
    ) -> list[dict[str, Any]]:
        """Search markets by title, ticker, or event ticker (client-side filter).

        Kalshi does not expose a dedicated full-text search endpoint; this method
        paginates ``GET /markets`` and filters results in-process. For large
        catalogs prefer :meth:`KalshiService.search_markets` which uses Redis
        caching.
        """
        needle = query.strip().lower()
        if not needle:
            return [
                market
                async for market in self.iter_markets(
                    limit=limit,
                    status=status,
                    max_pages=max_pages,
                )
            ]

        matches: list[dict[str, Any]] = []
        async for market in self.iter_markets(
            limit=limit,
            status=status,
            max_pages=max_pages,
        ):
            haystack = " ".join(
                [
                    str(market.get("title") or ""),
                    str(market.get("ticker") or ""),
                    str(market.get("event_ticker") or ""),
                    str(market.get("subtitle") or ""),
                ]
            ).lower()
            if needle in haystack:
                matches.append(market)
        return matches


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text


def _extract_error_message(payload: Any) -> str | None:
    if isinstance(payload, dict):
        for key in ("message", "error", "detail", "code"):
            value = payload.get(key)
            if value:
                return str(value)
    if isinstance(payload, str) and payload.strip():
        return payload.strip()
    return None


__all__ = [
    "DEFAULT_DEMO_BASE_URL",
    "DEFAULT_PRODUCTION_BASE_URL",
    "KalshiClient",
    "MarketsPage",
]
