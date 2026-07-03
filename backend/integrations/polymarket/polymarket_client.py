"""Async-friendly wrapper around the official Polymarket CLOB Python SDK."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import httpx
from py_clob_client_v2.client import ClobClient
from py_clob_client_v2.clob_types import ApiCreds
from py_clob_client_v2.constants import END_CURSOR, INITIAL_CURSOR, L0, L1, L2
from py_clob_client_v2.exceptions import PolyApiException, PolyException

from app.core.config import Settings, get_settings

from .exceptions import (
    PolymarketApiError,
    PolymarketAuthError,
    PolymarketError,
    PolymarketTimeoutError,
)

logger = logging.getLogger(__name__)

DEFAULT_HOST = "https://clob.polymarket.com"
DEFAULT_CHAIN_ID = 137  # Polygon mainnet — mirrors viem `polygon` chain id


@dataclass(frozen=True, slots=True)
class MarketsPage:
    """Normalized paginated markets response from the CLOB API."""

    data: list[dict[str, Any]]
    next_cursor: str
    limit: int | None = None
    count: int | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> MarketsPage:
        return cls(
            data=list(payload.get("data") or []),
            next_cursor=str(payload.get("next_cursor") or END_CURSOR),
            limit=payload.get("limit"),
            count=payload.get("count"),
        )


class PolymarketClient:
    """Production wrapper for read and authenticated Polymarket CLOB access.

    The underlying ``py-clob-client-v2`` SDK is synchronous; this class exposes
    async methods that delegate to ``asyncio.to_thread`` with timeouts.

    Authentication levels (mirrors the official client):
    - L0: public read-only market data (no credentials)
    - L1: wallet private key present (can derive API credentials)
    - L2: API key/secret/passphrase configured (trading endpoints)

    For wallet signing on-chain in TypeScript services, use ``viem`` with the
    same ``chain_id`` (137 for Polygon). This module stays Python-first.
    """

    def __init__(
        self,
        *,
        host: str = DEFAULT_HOST,
        chain_id: int = DEFAULT_CHAIN_ID,
        private_key: str | None = None,
        api_key: str | None = None,
        api_secret: str | None = None,
        api_passphrase: str | None = None,
        request_timeout_seconds: float = 30.0,
        use_server_time: bool = False,
        retry_on_error: bool = False,
    ) -> None:
        self.host = host.rstrip("/")
        self.chain_id = chain_id
        self._timeout = request_timeout_seconds
        self._private_key = private_key
        self._api_key = api_key
        self._api_secret = api_secret
        self._api_passphrase = api_passphrase

        creds = self._build_api_creds()
        self._client = ClobClient(
            self.host,
            chain_id=self.chain_id,
            key=private_key,
            creds=creds,
            use_server_time=use_server_time,
            retry_on_error=retry_on_error,
        )

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> PolymarketClient:
        """Build a client from ``PP_POLYMARKET_*`` application settings."""
        cfg = settings or get_settings()
        return cls(
            host=cfg.polymarket_host,
            chain_id=cfg.polymarket_chain_id,
            private_key=cfg.polymarket_private_key,
            api_key=cfg.polymarket_api_key,
            api_secret=cfg.polymarket_api_secret,
            api_passphrase=cfg.polymarket_api_passphrase,
            request_timeout_seconds=cfg.polymarket_request_timeout_seconds,
            use_server_time=cfg.polymarket_use_server_time,
            retry_on_error=cfg.polymarket_retry_on_error,
        )

    @property
    def sdk_client(self) -> ClobClient:
        """Underlying synchronous SDK client (use sparingly in async code)."""
        return self._client

    @property
    def auth_level(self) -> int:
        """Current auth level: ``L0`` (public), ``L1`` (wallet), or ``L2`` (API creds)."""
        return self._client.mode

    @property
    def has_wallet(self) -> bool:
        """True when a wallet private key is configured."""
        return self._private_key is not None

    @property
    def is_authenticated(self) -> bool:
        """True when L2 API credentials are available on the client."""
        return self._client.creds is not None

    @property
    def can_trade(self) -> bool:
        """True when the SDK has wallet + API credentials (L2 trading mode)."""
        return self.auth_level >= L2

    def _build_api_creds(self) -> ApiCreds | None:
        if not self._api_key or not self._api_secret or not self._api_passphrase:
            return None
        return ApiCreds(
            api_key=self._api_key,
            api_secret=self._api_secret,
            api_passphrase=self._api_passphrase,
        )

    async def authenticate(self, nonce: int | None = None) -> ApiCreds:
        """Derive or create L2 API credentials from the configured private key."""
        if not self._private_key:
            raise PolymarketAuthError(
                "A private key is required to authenticate with Polymarket."
            )

        try:
            creds = await self._run(self._client.create_or_derive_api_key, nonce)
        except PolymarketError:
            raise
        except Exception as exc:  # pragma: no cover - defensive
            raise PolymarketAuthError(
                "Failed to create or derive Polymarket API credentials.",
                cause=exc,
            ) from exc

        self._client.set_api_creds(creds)
        self._api_key = creds.api_key
        self._api_secret = creds.api_secret
        self._api_passphrase = creds.api_passphrase
        logger.info("Polymarket client authenticated (L2)")
        return creds

    async def get_markets(self, next_cursor: str = INITIAL_CURSOR) -> MarketsPage:
        """Fetch a page of CLOB markets."""
        payload = await self._run(self._client.get_markets, next_cursor)
        if not isinstance(payload, dict):
            raise PolymarketApiError("Unexpected markets response shape from Polymarket.")
        return MarketsPage.from_payload(payload)

    async def iter_markets(
        self,
        *,
        start_cursor: str = INITIAL_CURSOR,
        max_pages: int | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Iterate market records, following CLOB pagination cursors."""
        cursor = start_cursor
        pages = 0

        while cursor != END_CURSOR:
            page = await self.get_markets(cursor)
            for market in page.data:
                yield market

            if max_pages is not None:
                pages += 1
                if pages >= max_pages:
                    break

            cursor = page.next_cursor
            if not cursor:
                break

    async def get_market(self, condition_id: str) -> dict[str, Any]:
        """Fetch a single market by condition id."""
        if not condition_id:
            raise PolymarketError("condition_id is required.")
        payload = await self._run(self._client.get_market, condition_id)
        if not isinstance(payload, dict):
            raise PolymarketApiError("Unexpected market response shape from Polymarket.")
        return payload

    async def get_clob_market_info(self, condition_id: str) -> dict[str, Any]:
        """Fetch enriched CLOB market metadata (tick size, tokens, fees)."""
        if not condition_id:
            raise PolymarketError("condition_id is required.")
        return await self._run(self._client.get_clob_market_info, condition_id)

    async def get_order_book(self, token_id: str) -> dict[str, Any]:
        """Fetch the order book for a market outcome token."""
        if not token_id:
            raise PolymarketError("token_id is required.")
        payload = await self._run(self._client.get_order_book, token_id)
        if not isinstance(payload, dict):
            raise PolymarketApiError("Unexpected order book response shape from Polymarket.")
        return payload

    async def get_midpoint(self, token_id: str) -> Any:
        """Fetch the midpoint price for a token."""
        if not token_id:
            raise PolymarketError("token_id is required.")
        return await self._run(self._client.get_midpoint, token_id)

    async def get_price(self, token_id: str, side: str) -> Any:
        """Fetch the best bid/ask price for a token and side (``BUY`` / ``SELL``)."""
        if not token_id:
            raise PolymarketError("token_id is required.")
        if not side:
            raise PolymarketError("side is required.")
        return await self._run(self._client.get_price, token_id, side)

    async def _run(self, fn: Any, /, *args: Any, **kwargs: Any) -> Any:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(fn, *args, **kwargs),
                timeout=self._timeout,
            )
        except asyncio.TimeoutError as exc:
            raise PolymarketTimeoutError(
                f"Polymarket request timed out after {self._timeout}s."
            ) from exc
        except PolyApiException as exc:
            raise PolymarketApiError(
                str(exc.error_msg),
                status_code=exc.status_code,
                error_payload=exc.error_msg,
                cause=exc,
            ) from exc
        except PolyException as exc:
            message = getattr(exc, "msg", None) or str(exc)
            if message in {
                "A private key is needed to interact with this endpoint!",
                "API Credentials are needed to interact with this endpoint!",
            }:
                raise PolymarketAuthError(message, cause=exc) from exc
            raise PolymarketError(message, cause=exc) from exc
        except httpx.HTTPError as exc:
            raise PolymarketApiError(
                "HTTP error while calling Polymarket.",
                cause=exc,
            ) from exc
        except Exception as exc:
            raise PolymarketError(
                "Unexpected error while calling Polymarket.",
                cause=exc,
            ) from exc


__all__ = [
    "DEFAULT_CHAIN_ID",
    "DEFAULT_HOST",
    "L0",
    "L1",
    "L2",
    "MarketsPage",
    "PolymarketClient",
]
