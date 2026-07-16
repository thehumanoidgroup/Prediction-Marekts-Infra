"""Unit tests for the Alpaca IEX free-tier client (mocked HTTP)."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from integrations.alpaca.alpaca_client import AlpacaClient
from integrations.alpaca.exceptions import AlpacaAuthError, AlpacaRateLimitError
from integrations.alpaca.sp500_tickers import SP500_TICKERS


def _client() -> AlpacaClient:
    return AlpacaClient(
        api_key="PKTEST",
        secret_key="SECRET",
        rate_limit_per_minute=1000,
        max_retries=1,
        retry_backoff_seconds=0.01,
    )


def test_get_sp500_tickers_includes_liquid_names() -> None:
    client = _client()
    tickers = client.get_sp500_tickers()
    assert "AAPL" in tickers
    assert "MSFT" in tickers
    assert "BRK.B" in tickers
    assert len(tickers) == len(SP500_TICKERS)


def test_missing_credentials_raise() -> None:
    with pytest.raises(AlpacaAuthError):
        AlpacaClient(api_key=None, secret_key=None)


@pytest.mark.asyncio
async def test_get_current_price() -> None:
    client = _client()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {"trade": {"p": 190.25, "s": 10, "t": "2026-07-16T14:00:00Z"}}
    response.headers = {}

    http = AsyncMock()
    http.is_closed = False
    http.request = AsyncMock(return_value=response)
    client._client = http

    price = await client.get_current_price("aapl")
    assert price == 190.25
    http.request.assert_awaited()
    args, kwargs = http.request.await_args
    assert args[0] == "GET"
    assert args[1] == "/stocks/AAPL/trades/latest"
    assert kwargs["params"]["feed"] == "iex"


@pytest.mark.asyncio
async def test_get_snapshot() -> None:
    client = _client()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "latestTrade": {"p": 10.0},
        "latestQuote": {"ap": 10.1, "bp": 9.9},
        "dailyBar": {"c": 10.0},
    }
    response.headers = {}

    http = AsyncMock()
    http.is_closed = False
    http.request = AsyncMock(return_value=response)
    client._client = http

    snap = await client.get_snapshot("MSFT")
    assert snap["symbol"] == "MSFT"
    assert snap["latestTrade"]["p"] == 10.0


@pytest.mark.asyncio
async def test_get_snapshots_all_chunks() -> None:
    client = _client()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "AAPL": {"latestTrade": {"p": 1.0}},
        "MSFT": {"latestTrade": {"p": 2.0}},
    }
    response.headers = {}

    http = AsyncMock()
    http.is_closed = False
    http.request = AsyncMock(return_value=response)
    client._client = http

    snaps = await client.get_snapshots_all(["AAPL", "MSFT"], chunk_size=50)
    assert set(snaps) == {"AAPL", "MSFT"}


@pytest.mark.asyncio
async def test_get_daily_bars() -> None:
    client = _client()
    response = MagicMock(spec=httpx.Response)
    response.status_code = 200
    response.json.return_value = {
        "bars": [{"t": "2026-07-15T04:00:00Z", "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 100}]
    }
    response.headers = {}

    http = AsyncMock()
    http.is_closed = False
    http.request = AsyncMock(return_value=response)
    client._client = http

    bars = await client.get_daily_bars("AAPL", date(2026, 7, 15))
    assert len(bars) == 1
    assert bars[0]["c"] == 1.5


@pytest.mark.asyncio
async def test_rate_limit_retries_then_raises() -> None:
    client = AlpacaClient(
        api_key="PKTEST",
        secret_key="SECRET",
        rate_limit_per_minute=1000,
        max_retries=1,
        retry_backoff_seconds=0.01,
    )
    response = MagicMock(spec=httpx.Response)
    response.status_code = 429
    response.headers = {"Retry-After": "0"}
    response.json.return_value = {"message": "too many requests"}
    response.text = "too many requests"

    http = AsyncMock()
    http.is_closed = False
    http.request = AsyncMock(return_value=response)
    client._client = http

    with pytest.raises(AlpacaRateLimitError):
        await client.get_current_price("AAPL")
    assert http.request.await_count == 2
