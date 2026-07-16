"""Async Alpaca Market Data API client (IEX free tier) using httpx + websockets.

Official docs
-------------
- https://alpaca.markets/docs/
- https://alpaca.markets/docs/api-references/market-data-api/
- https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/

Free tier (Basic / IEX)
-----------------------
- Live equity coverage: **IEX only** (not full SIP)
- Auth: ``APCA-API-KEY-ID`` + ``APCA-API-SECRET-KEY`` headers
- REST base: ``https://data.alpaca.markets/v2``
- WebSocket: ``wss://stream.data.alpaca.markets/v2/iex``
- Historical API budget: ~200 calls / minute on Basic
- WebSocket symbol limit: 30 concurrent subscriptions on Basic

Use **paper trading keys** for the MVP
(``ALPACA_API_KEY`` / ``ALPACA_SECRET_KEY`` from the Alpaca paper dashboard).

Replace with Polygon.io client when scaling
-------------------------------------------
When you need full SIP coverage, higher rate limits, or richer fundamentals,
swap this module for a Polygon.io client. Keep the service façade
(``AlpacaService`` method names) stable so callers do not churn.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable, Iterable, Sequence
from datetime import date, datetime, timezone
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from integrations.polymarket.rate_limiter import AsyncRateLimiter

from .exceptions import (
    AlpacaApiError,
    AlpacaAuthError,
    AlpacaError,
    AlpacaRateLimitError,
    AlpacaTimeoutError,
    AlpacaWebSocketError,
)
from .sp500_tickers import SP500_TICKERS

logger = logging.getLogger(__name__)

# Market Data API v2 (stocks).
# Docs: https://alpaca.markets/docs/api-references/market-data-api/
DEFAULT_DATA_BASE_URL = "https://data.alpaca.markets/v2"

# Real-time IEX stream (Basic / free tier).
# Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/
DEFAULT_IEX_STREAM_URL = "wss://stream.data.alpaca.markets/v2/iex"

# Free-tier default: IEX feed only.
DEFAULT_FEED = "iex"

QuoteHandler = Callable[[dict[str, Any]], Awaitable[None] | None]
TradeHandler = Callable[[dict[str, Any]], Awaitable[None] | None]
BarHandler = Callable[[dict[str, Any]], Awaitable[None] | None]
ErrorHandler = Callable[[Exception], Awaitable[None] | None]


def _resolve_credentials(
    *,
    api_key: str | None,
    secret_key: str | None,
) -> tuple[str, str]:
    """Require both paper/live Alpaca keys (Market Data always needs auth)."""
    key = (api_key or "").strip()
    secret = (secret_key or "").strip()
    if not key or not secret:
        raise AlpacaAuthError(
            "Alpaca credentials required. Set ALPACA_API_KEY and ALPACA_SECRET_KEY "
            "(paper trading keys are fine for the MVP). "
            "Docs: https://alpaca.markets/docs/"
        )
    return key, secret


def _chunked(values: Sequence[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield list(values[index : index + size])


class AlpacaClient:
    """Production async client for Alpaca Market Data (IEX free tier).

    Parameters
    ----------
    api_key / secret_key:
        Paper or live Alpaca API keys. Paper keys are recommended for MVP.
    data_base_url:
        REST root including ``/v2`` (default production data host).
    feed:
        ``iex`` for free tier; ``sip`` requires Algo Trader Plus.
    rate_limit_per_minute:
        Outbound REST budget. Basic plan allows ~200 historical calls / min.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        secret_key: str | None = None,
        data_base_url: str = DEFAULT_DATA_BASE_URL,
        feed: str = DEFAULT_FEED,
        request_timeout_seconds: float = 30.0,
        rate_limit_per_minute: int = 180,
        max_retries: int = 3,
        retry_backoff_seconds: float = 0.5,
    ) -> None:
        self._api_key, self._secret_key = _resolve_credentials(
            api_key=api_key,
            secret_key=secret_key,
        )
        self.data_base_url = data_base_url.rstrip("/")
        self.feed = feed or DEFAULT_FEED
        self._timeout = request_timeout_seconds
        self._max_retries = max(0, max_retries)
        self._retry_backoff_seconds = retry_backoff_seconds
        self._limiter = AsyncRateLimiter(rate_limit_per_minute, 60.0)
        self._client: httpx.AsyncClient | None = None

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> AlpacaClient:
        cfg = settings or get_settings()
        return cls(
            api_key=cfg.alpaca_api_key,
            secret_key=cfg.alpaca_secret_key,
            data_base_url=cfg.alpaca_data_base_url,
            feed=cfg.alpaca_feed,
            request_timeout_seconds=cfg.alpaca_request_timeout_seconds,
            rate_limit_per_minute=cfg.alpaca_rate_limit_per_minute,
            max_retries=cfg.alpaca_max_retries,
            retry_backoff_seconds=cfg.alpaca_retry_backoff_seconds,
        )

    def _auth_headers(self) -> dict[str, str]:
        return {
            "APCA-API-KEY-ID": self._api_key,
            "APCA-API-SECRET-KEY": self._secret_key,
            "Accept": "application/json",
        }

    async def _get_http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.data_base_url,
                headers=self._auth_headers(),
                timeout=httpx.Timeout(self._timeout),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    async def __aenter__(self) -> AlpacaClient:
        await self._get_http()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    # ------------------------------------------------------------------
    # Public market-data helpers
    # ------------------------------------------------------------------

    def get_sp500_tickers(self) -> list[str]:
        """Return the curated S&P 500 universe used by the MVP.

        Alpaca does not publish an official constituents endpoint on the free
        Market Data API, so this returns the static list in ``sp500_tickers.py``.
        """
        return list(SP500_TICKERS)

    async def get_current_price(self, ticker: str) -> float:
        """Return the latest trade price for ``ticker`` (IEX on free tier).

        Uses ``GET /v2/stocks/{symbol}/trades/latest``.
        Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/trades/
        """
        symbol = self._normalize_symbol(ticker)
        payload = await self._request(
            "GET",
            f"/stocks/{symbol}/trades/latest",
            params={"feed": self.feed},
        )
        trade = payload.get("trade") or {}
        price = trade.get("p")
        if price is None:
            raise AlpacaApiError(
                f"No latest trade price for {symbol}",
                error_payload=payload,
            )
        return float(price)

    async def get_snapshot(self, ticker: str) -> dict[str, Any]:
        """Return a single-symbol snapshot (latest trade/quote + bars).

        Uses ``GET /v2/stocks/{symbol}/snapshot``.
        Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/snapshots/
        """
        symbol = self._normalize_symbol(ticker)
        payload = await self._request(
            "GET",
            f"/stocks/{symbol}/snapshot",
            params={"feed": self.feed},
        )
        # Single-symbol endpoint returns the snapshot object directly.
        if "symbol" not in payload and "latestTrade" not in payload and "latestQuote" not in payload:
            # Multi-symbol style nested under symbol key — normalize.
            nested = payload.get(symbol) or payload.get(symbol.upper())
            if isinstance(nested, dict):
                return {"symbol": symbol, **nested}
        return {"symbol": symbol, **payload} if "symbol" not in payload else payload

    async def get_snapshots_all(
        self,
        tickers: Sequence[str] | None = None,
        *,
        chunk_size: int = 50,
    ) -> dict[str, dict[str, Any]]:
        """Return snapshots for many symbols (defaults to S&P 500 MVP list).

        Uses ``GET /v2/stocks/snapshots?symbols=...``.
        Free-tier tip: chunk symbols to stay under URL limits and rate budgets.
        Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/snapshots/
        """
        symbols = [self._normalize_symbol(t) for t in (tickers or self.get_sp500_tickers())]
        if not symbols:
            return {}

        out: dict[str, dict[str, Any]] = {}
        for batch in _chunked(symbols, max(1, chunk_size)):
            payload = await self._request(
                "GET",
                "/stocks/snapshots",
                params={"symbols": ",".join(batch), "feed": self.feed},
            )
            # Prefer nested ``snapshots`` map when present; else symbol-keyed object.
            # Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/snapshots/
            nested = payload.get("snapshots")
            source = nested if isinstance(nested, dict) else payload
            for symbol, snapshot in source.items():
                if symbol == "snapshots" or not isinstance(snapshot, dict):
                    continue
                # Skip non-snapshot envelope keys if any.
                if "latestTrade" not in snapshot and "latestQuote" not in snapshot and "dailyBar" not in snapshot:
                    continue
                out[str(symbol).upper()] = {"symbol": str(symbol).upper(), **snapshot}
        return out

    async def get_daily_bars(
        self,
        ticker: str,
        bar_date: date | datetime | str,
        *,
        adjustment: str = "split",
    ) -> list[dict[str, Any]]:
        """Return daily bars for ``ticker`` on a calendar date (resolution helper).

        Uses ``GET /v2/stocks/{symbol}/bars`` with ``timeframe=1Day``.
        Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/historical/#bars

        Parameters
        ----------
        bar_date:
            Calendar day to resolve (UTC midnight → next day exclusive window).
        adjustment:
            ``raw`` | ``split`` | ``dividend`` | ``all`` (Alpaca bar adjustment).
        """
        symbol = self._normalize_symbol(ticker)
        day = self._coerce_date(bar_date)
        start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        end = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc)

        payload = await self._request(
            "GET",
            f"/stocks/{symbol}/bars",
            params={
                "timeframe": "1Day",
                "start": start.isoformat().replace("+00:00", "Z"),
                "end": end.isoformat().replace("+00:00", "Z"),
                "adjustment": adjustment,
                "feed": self.feed,
                "limit": 10,
            },
        )
        bars = payload.get("bars") or []
        return list(bars)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_symbol(ticker: str) -> str:
        symbol = (ticker or "").strip().upper()
        if not symbol:
            raise AlpacaError("ticker is required")
        # Alpaca uses dotted class shares as BRK.B (not BRK/B).
        return symbol.replace("/", ".")

    @staticmethod
    def _coerce_date(value: date | datetime | str) -> date:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        text = str(value).strip()
        if "T" in text:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        return date.fromisoformat(text)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        client = await self._get_http()
        query = {key: value for key, value in (params or {}).items() if value is not None}
        last_error: Exception | None = None

        for attempt in range(self._max_retries + 1):
            await self._limiter.acquire()
            try:
                response = await client.request(method, path, params=query)
            except httpx.TimeoutException as exc:
                last_error = AlpacaTimeoutError(
                    f"Alpaca request timed out: {method} {path}",
                    cause=exc,
                )
            except httpx.HTTPError as exc:
                last_error = AlpacaApiError(
                    f"Alpaca HTTP error: {method} {path}",
                    cause=exc,
                )
            else:
                if response.status_code == 429:
                    retry_after = float(response.headers.get("Retry-After", "1") or 1)
                    last_error = AlpacaRateLimitError(
                        "Alpaca rate limit exceeded (HTTP 429). "
                        "Basic plan ≈ 200 historical calls/min — back off or upgrade. "
                        "Replace with Polygon.io client when scaling.",
                        status_code=429,
                        error_payload=_safe_json(response),
                    )
                    if attempt < self._max_retries:
                        await asyncio.sleep(max(retry_after, self._retry_backoff_seconds * (2**attempt)))
                        continue
                    raise last_error

                if response.status_code in {401, 403}:
                    raise AlpacaAuthError(
                        "Alpaca rejected credentials (check ALPACA_API_KEY / ALPACA_SECRET_KEY). "
                        "Docs: https://alpaca.markets/docs/"
                    )

                if response.status_code >= 400:
                    payload = _safe_json(response)
                    message = (
                        payload.get("message")
                        if isinstance(payload, dict)
                        else None
                    ) or f"Alpaca API error {response.status_code}"
                    raise AlpacaApiError(
                        str(message),
                        status_code=response.status_code,
                        error_payload=payload,
                    )

                payload = _safe_json(response)
                if not isinstance(payload, dict):
                    return {"data": payload}
                return payload

            if attempt < self._max_retries:
                await asyncio.sleep(self._retry_backoff_seconds * (2**attempt))
                continue
            assert last_error is not None
            raise last_error

        raise AlpacaError(f"Alpaca request failed: {method} {path}")


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:  # noqa: BLE001
        return {"raw": response.text}


class AlpacaStockStream:
    """WebSocket client for real-time IEX stock quotes and trades.

    Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/

    Protocol summary
    ----------------
    1. Connect to ``wss://stream.data.alpaca.markets/v2/iex``
    2. Authenticate: ``{"action":"auth","key":"...","secret":"..."}``
    3. Subscribe: ``{"action":"subscribe","trades":[...],"quotes":[...],"bars":[...]}``
    4. Receive arrays of messages: ``"t"`` trades, ``"q"`` quotes, ``"b"`` bars,
       plus ``success`` / ``error`` control frames

    Free tier limit: **30 symbols** total across channels.

    Replace with Polygon.io websocket client when scaling beyond IEX / 30 symbols.
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        secret_key: str | None = None,
        stream_url: str = DEFAULT_IEX_STREAM_URL,
        on_quote: QuoteHandler | None = None,
        on_trade: TradeHandler | None = None,
        on_bar: BarHandler | None = None,
        on_error: ErrorHandler | None = None,
        max_symbols: int = 30,
    ) -> None:
        self._api_key, self._secret_key = _resolve_credentials(
            api_key=api_key,
            secret_key=secret_key,
        )
        self.stream_url = stream_url
        self.on_quote = on_quote
        self.on_trade = on_trade
        self.on_bar = on_bar
        self.on_error = on_error
        self.max_symbols = max_symbols
        self._ws: Any = None
        self._running = False
        self._subscribed_trades: set[str] = set()
        self._subscribed_quotes: set[str] = set()
        self._subscribed_bars: set[str] = set()

    @classmethod
    def from_settings(
        cls,
        settings: Settings | None = None,
        **handlers: Any,
    ) -> AlpacaStockStream:
        cfg = settings or get_settings()
        return cls(
            api_key=cfg.alpaca_api_key,
            secret_key=cfg.alpaca_secret_key,
            stream_url=cfg.alpaca_iex_stream_url,
            max_symbols=cfg.alpaca_ws_max_symbols,
            **handlers,
        )

    async def connect(self) -> None:
        """Open the IEX stream and authenticate."""
        try:
            import websockets  # type: ignore[import-untyped]
        except ImportError as exc:  # pragma: no cover
            raise AlpacaWebSocketError(
                "The 'websockets' package is required for Alpaca realtime streams. "
                "Install via uvicorn[standard] or `pip install websockets`.",
                cause=exc,
            ) from exc

        try:
            self._ws = await websockets.connect(
                self.stream_url,
                ping_interval=20,
                ping_timeout=20,
                max_queue=1024,
            )
            await self._authenticate()
            self._running = True
            logger.info("Alpaca IEX WebSocket connected (%s)", self.stream_url)
        except AlpacaWebSocketError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise AlpacaWebSocketError(
                f"Failed to connect Alpaca IEX stream: {self.stream_url}",
                cause=exc,
            ) from exc

    async def _authenticate(self) -> None:
        """Send credentials and wait until ``msg == authenticated``.

        Docs: https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/
        The gateway may first emit ``{"T":"success","msg":"connected"}`` — that
        must not be treated as a completed auth handshake.
        """
        assert self._ws is not None
        await self._ws.send(
            json.dumps(
                {
                    "action": "auth",
                    "key": self._api_key,
                    "secret": self._secret_key,
                }
            )
        )
        deadline = time.monotonic() + 10.0
        while time.monotonic() < deadline:
            remaining = max(0.1, deadline - time.monotonic())
            raw = await asyncio.wait_for(self._ws.recv(), timeout=remaining)
            messages = json.loads(raw)
            if not isinstance(messages, list):
                messages = [messages]
            for message in messages:
                if message.get("T") == "error" or message.get("msg") == "auth failed":
                    raise AlpacaWebSocketError(f"Alpaca stream auth failed: {message}")
                if message.get("msg") == "authenticated":
                    return
                # Ignore "connected" and other success control frames until auth completes.
        raise AlpacaWebSocketError("Alpaca stream auth timed out waiting for authenticated")

    async def subscribe(
        self,
        *,
        trades: Sequence[str] | None = None,
        quotes: Sequence[str] | None = None,
        bars: Sequence[str] | None = None,
    ) -> None:
        """Subscribe to realtime channels (max ``max_symbols`` unique symbols)."""
        if self._ws is None:
            raise AlpacaWebSocketError("WebSocket is not connected — call connect() first")

        trade_syms = [AlpacaClient._normalize_symbol(t) for t in (trades or [])]
        quote_syms = [AlpacaClient._normalize_symbol(t) for t in (quotes or [])]
        bar_syms = [AlpacaClient._normalize_symbol(t) for t in (bars or [])]

        unique = set(trade_syms) | set(quote_syms) | set(bar_syms) | self._subscribed_trades | self._subscribed_quotes | self._subscribed_bars
        if len(unique) > self.max_symbols:
            raise AlpacaWebSocketError(
                f"Free-tier IEX stream allows {self.max_symbols} symbols; "
                f"requested {len(unique)}. Replace with Polygon.io when scaling."
            )

        payload = {
            "action": "subscribe",
            "trades": trade_syms,
            "quotes": quote_syms,
            "bars": bar_syms,
        }
        await self._ws.send(json.dumps(payload))
        self._subscribed_trades.update(trade_syms)
        self._subscribed_quotes.update(quote_syms)
        self._subscribed_bars.update(bar_syms)

    async def unsubscribe(
        self,
        *,
        trades: Sequence[str] | None = None,
        quotes: Sequence[str] | None = None,
        bars: Sequence[str] | None = None,
    ) -> None:
        if self._ws is None:
            return
        trade_syms = [AlpacaClient._normalize_symbol(t) for t in (trades or [])]
        quote_syms = [AlpacaClient._normalize_symbol(t) for t in (quotes or [])]
        bar_syms = [AlpacaClient._normalize_symbol(t) for t in (bars or [])]
        await self._ws.send(
            json.dumps(
                {
                    "action": "unsubscribe",
                    "trades": trade_syms,
                    "quotes": quote_syms,
                    "bars": bar_syms,
                }
            )
        )
        self._subscribed_trades.difference_update(trade_syms)
        self._subscribed_quotes.difference_update(quote_syms)
        self._subscribed_bars.difference_update(bar_syms)

    async def run_forever(self) -> None:
        """Dispatch inbound stream messages until ``close()`` is called."""
        if self._ws is None:
            await self.connect()
        assert self._ws is not None
        self._running = True

        try:
            async for raw in self._ws:
                if not self._running:
                    break
                try:
                    messages = json.loads(raw)
                except json.JSONDecodeError as exc:
                    await self._emit_error(AlpacaWebSocketError("Invalid JSON from Alpaca stream", cause=exc))
                    continue
                if not isinstance(messages, list):
                    messages = [messages]
                for message in messages:
                    await self._dispatch(message)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            await self._emit_error(AlpacaWebSocketError("Alpaca stream closed unexpectedly", cause=exc))
            raise
        finally:
            await self.close()

    async def _dispatch(self, message: dict[str, Any]) -> None:
        msg_type = message.get("T")

        if msg_type == "q" and self.on_quote:
            result = self.on_quote(message)
            if asyncio.iscoroutine(result):
                await result
            return

        if msg_type == "t" and self.on_trade:
            result = self.on_trade(message)
            if asyncio.iscoroutine(result):
                await result
            return

        if msg_type == "b" and self.on_bar:
            result = self.on_bar(message)
            if asyncio.iscoroutine(result):
                await result
            return

        if msg_type == "error":
            await self._emit_error(AlpacaWebSocketError(f"Alpaca stream error: {message}"))
            return

        # Ignore control frames: success / subscription confirmations.

    async def _emit_error(self, error: Exception) -> None:
        logger.error("%s", error)
        if self.on_error:
            result = self.on_error(error)
            if asyncio.iscoroutine(result):
                await result

    async def close(self) -> None:
        self._running = False
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
