"""Tests for the Polymarket CLOB integration wrapper."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest
from py_clob_client_v2.clob_types import ApiCreds
from py_clob_client_v2.constants import L0, L2
from py_clob_client_v2.exceptions import PolyApiException, PolyException

from app.core.config import Settings
from integrations.polymarket import (
    MarketsPage,
    PolymarketApiError,
    PolymarketAuthError,
    PolymarketClient,
    PolymarketError,
    PolymarketTimeoutError,
)


@pytest.fixture
def public_client() -> PolymarketClient:
    return PolymarketClient(request_timeout_seconds=5.0)


@pytest.fixture
def authenticated_client() -> PolymarketClient:
    return PolymarketClient(
        api_key="key",
        api_secret="secret",
        api_passphrase="pass",
        request_timeout_seconds=5.0,
    )


def test_from_settings_uses_pp_env_prefix() -> None:
    settings = Settings(
        polymarket_host="https://example-clob.test",
        polymarket_chain_id=80002,
        polymarket_api_key="k",
        polymarket_api_secret="s",
        polymarket_api_passphrase="p",
    )
    client = PolymarketClient.from_settings(settings)

    assert client.host == "https://example-clob.test"
    assert client.chain_id == 80002
    assert client.is_authenticated is True


def test_public_client_auth_level(public_client: PolymarketClient) -> None:
    assert public_client.auth_level == L0
    assert public_client.is_authenticated is False


def test_authenticated_client_auth_level(authenticated_client: PolymarketClient) -> None:
    # SDK mode stays L0 without a wallet, but API credentials are still attached.
    assert authenticated_client.auth_level == L0
    assert authenticated_client.is_authenticated is True
    assert authenticated_client.can_trade is False


@pytest.mark.asyncio
async def test_get_markets_returns_normalized_page(public_client: PolymarketClient) -> None:
    payload = {
        "data": [{"condition_id": "0xabc", "question": "Test?"}],
        "next_cursor": "next",
        "limit": 1000,
        "count": 1,
    }
    public_client._client.get_markets = MagicMock(return_value=payload)

    page = await public_client.get_markets()

    assert isinstance(page, MarketsPage)
    assert page.data[0]["condition_id"] == "0xabc"
    assert page.next_cursor == "next"
    assert page.limit == 1000
    public_client._client.get_markets.assert_called_once()


@pytest.mark.asyncio
async def test_get_market_requires_condition_id(public_client: PolymarketClient) -> None:
    with pytest.raises(PolymarketError, match="condition_id"):
        await public_client.get_market("")


@pytest.mark.asyncio
async def test_get_market_delegates_to_sdk(public_client: PolymarketClient) -> None:
    market = {"condition_id": "0xabc", "question": "Will it rain?"}
    public_client._client.get_market = MagicMock(return_value=market)

    result = await public_client.get_market("0xabc")

    assert result == market
    public_client._client.get_market.assert_called_once_with("0xabc")


@pytest.mark.asyncio
async def test_get_order_book_and_midpoint(public_client: PolymarketClient) -> None:
    public_client._client.get_order_book = MagicMock(return_value={"bids": [], "asks": []})
    public_client._client.get_midpoint = MagicMock(return_value="0.55")

    book = await public_client.get_order_book("token-1")
    midpoint = await public_client.get_midpoint("token-1")

    assert book["bids"] == []
    assert midpoint == "0.55"


@pytest.mark.asyncio
async def test_iter_markets_paginates(public_client: PolymarketClient) -> None:
    public_client._client.get_markets = MagicMock(
        side_effect=[
            {"data": [{"condition_id": "1"}], "next_cursor": "page-2"},
            {"data": [{"condition_id": "2"}], "next_cursor": "LTE="},
        ]
    )

    markets = [market async for market in public_client.iter_markets()]

    assert [m["condition_id"] for m in markets] == ["1", "2"]
    assert public_client._client.get_markets.call_count == 2


@pytest.mark.asyncio
async def test_authenticate_without_private_key_raises() -> None:
    client = PolymarketClient()

    with pytest.raises(PolymarketAuthError, match="private key"):
        await client.authenticate()


@pytest.mark.asyncio
async def test_authenticate_sets_l2_credentials() -> None:
    client = PolymarketClient(private_key="0x" + "1" * 64)
    creds = ApiCreds(api_key="k", api_secret="s", api_passphrase="p")
    client._client.create_or_derive_api_key = MagicMock(return_value=creds)

    result = await client.authenticate()

    assert result == creds
    assert client.is_authenticated is True
    assert client.can_trade is True


@pytest.mark.asyncio
async def test_poly_api_exception_maps_to_polymarket_api_error(
    public_client: PolymarketClient,
) -> None:
    response = httpx.Response(400, json={"error": "bad request"})
    public_client._client.get_market = MagicMock(
        side_effect=PolyApiException(resp=response)
    )

    with pytest.raises(PolymarketApiError) as exc_info:
        await public_client.get_market("0xbad")

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_poly_exception_auth_message_maps_to_auth_error(
    public_client: PolymarketClient,
) -> None:
    public_client._client.get_market = MagicMock(
        side_effect=PolyException("API Credentials are needed to interact with this endpoint!")
    )

    with pytest.raises(PolymarketAuthError):
        await public_client.get_market("0xneed-creds")


@pytest.mark.asyncio
async def test_timeout_maps_to_polymarket_timeout_error(
    public_client: PolymarketClient,
) -> None:
    async def slow_to_thread(fn, *args, **kwargs):
        import asyncio

        await asyncio.sleep(0.05)
        return fn(*args, **kwargs)

    public_client._client.get_markets = MagicMock(return_value={"data": []})
    public_client._timeout = 0.01

    with patch("integrations.polymarket.polymarket_client.asyncio.to_thread", slow_to_thread):
        with pytest.raises(PolymarketTimeoutError):
            await public_client.get_markets()
