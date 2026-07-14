"""Tests for the Kalshi Trading API integration client."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import Settings
from integrations.kalshi import (
    KalshiApiError,
    KalshiAuthError,
    KalshiClient,
    KalshiError,
    KalshiRateLimitError,
    KalshiTimeoutError,
    MarketsPage,
)
from integrations.kalshi.kalshi_client import _resolve_credentials


def _generate_test_private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


@pytest.fixture
def public_client() -> KalshiClient:
    return KalshiClient(request_timeout_seconds=5.0)


@pytest.fixture
def authenticated_client() -> KalshiClient:
    return KalshiClient(
        api_key="test-key-id",
        api_secret=_generate_test_private_key_pem(),
        request_timeout_seconds=5.0,
    )


def test_from_settings_uses_pp_env_prefix() -> None:
    settings = Settings(
        kalshi_base_url="https://example.kalshi.test/trade-api/v2",
        kalshi_api_key="key-id",
        kalshi_api_secret=_generate_test_private_key_pem(),
    )
    client = KalshiClient.from_settings(settings)

    assert client.base_url == "https://example.kalshi.test/trade-api/v2"
    assert client.is_authenticated is True


def test_public_client_auth_mode(public_client: KalshiClient) -> None:
    assert public_client.auth_mode == "public"
    assert public_client.is_authenticated is False


def test_authenticated_client_auth_mode(authenticated_client: KalshiClient) -> None:
    assert authenticated_client.auth_mode == "authenticated"
    assert authenticated_client.is_authenticated is True


def test_resolve_credentials_requires_full_pair() -> None:
    key, secret = _resolve_credentials(api_key="key", api_secret=None)
    assert (key, secret) == (None, None)


@pytest.mark.asyncio
async def test_get_markets_returns_normalized_page(public_client: KalshiClient) -> None:
    payload = {
        "markets": [{"ticker": "KXBTC-25", "title": "BTC market"}],
        "cursor": "next-page",
    }
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = payload

    mock_http = AsyncMock()
    mock_http.request = AsyncMock(return_value=mock_response)
    public_client._http = mock_http

    page = await public_client.get_markets(limit=1, status="open")

    assert isinstance(page, MarketsPage)
    assert page.markets[0]["ticker"] == "KXBTC-25"
    assert page.cursor == "next-page"


@pytest.mark.asyncio
async def test_get_market_requires_ticker(public_client: KalshiClient) -> None:
    with pytest.raises(KalshiError, match="market_ticker"):
        await public_client.get_market("")


@pytest.mark.asyncio
async def test_get_market_parses_nested_market(public_client: KalshiClient) -> None:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "market": {"ticker": "KXBTC-25", "title": "BTC?"},
    }

    mock_http = AsyncMock()
    mock_http.request = AsyncMock(return_value=mock_response)
    public_client._http = mock_http

    market = await public_client.get_market("KXBTC-25")

    assert market["ticker"] == "KXBTC-25"


@pytest.mark.asyncio
async def test_get_orderbook(public_client: KalshiClient) -> None:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "orderbook_fp": {"yes_dollars": [["0.55", "10"]], "no_dollars": []},
    }

    mock_http = AsyncMock()
    mock_http.request = AsyncMock(return_value=mock_response)
    public_client._http = mock_http

    book = await public_client.get_orderbook("KXBTC-25")

    assert "orderbook_fp" in book


@pytest.mark.asyncio
async def test_search_markets_filters_results(public_client: KalshiClient) -> None:
    async def fake_iter(**_kwargs):
        yield {"ticker": "KXBTC-25", "title": "Bitcoin price", "event_ticker": "KXBTC"}
        yield {"ticker": "KXFED-25", "title": "Fed rate cut", "event_ticker": "KXFED"}

    public_client.iter_markets = fake_iter  # type: ignore[method-assign]

    matches = await public_client.search_markets("bitcoin")

    assert len(matches) == 1
    assert matches[0]["ticker"] == "KXBTC-25"


@pytest.mark.asyncio
async def test_rate_limit_429_retries_then_raises(public_client: KalshiClient) -> None:
    rate_limited = httpx.Response(429, json={"error": "rate limited"})
    public_client._max_retries = 2
    public_client._retry_backoff_seconds = 0.01

    mock_http = AsyncMock()
    mock_http.request = AsyncMock(return_value=rate_limited)
    public_client._http = mock_http

    with pytest.raises(KalshiRateLimitError) as exc_info:
        await public_client.get_market("KXBTC-25")

    assert exc_info.value.status_code == 429
    assert mock_http.request.await_count == 3


@pytest.mark.asyncio
async def test_auth_error_on_401(public_client: KalshiClient) -> None:
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.json.return_value = {"message": "unauthorized"}

    mock_http = AsyncMock()
    mock_http.request = AsyncMock(return_value=mock_response)
    public_client._http = mock_http

    with pytest.raises(KalshiAuthError):
        await public_client.get_market("KXBTC-25")


@pytest.mark.asyncio
async def test_timeout_maps_to_kalshi_timeout_error(public_client: KalshiClient) -> None:
    mock_http = AsyncMock()
    mock_http.request = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
    public_client._http = mock_http

    with pytest.raises(KalshiTimeoutError):
        await public_client.get_market("KXBTC-25")


@pytest.mark.asyncio
async def test_authenticated_request_includes_signature_headers(
    authenticated_client: KalshiClient,
) -> None:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"market": {"ticker": "KXBTC-25"}}

    mock_http = AsyncMock()
    mock_http.request = AsyncMock(return_value=mock_response)
    authenticated_client._http = mock_http

    await authenticated_client.get_market("KXBTC-25")

    headers = mock_http.request.await_args.kwargs["headers"]
    assert headers["KALSHI-ACCESS-KEY"] == "test-key-id"
    assert headers["KALSHI-ACCESS-TIMESTAMP"]
    assert headers["KALSHI-ACCESS-SIGNATURE"]
