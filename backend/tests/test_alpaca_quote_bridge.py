"""Tests for viewed-ticker analytics and Alpaca quote bridge helpers."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.alpaca_quote_bridge import AlpacaQuoteBridge
from services.live_feed_analytics import LiveFeedAnalytics


def test_viewed_tickers_expire_and_rank_recent_first() -> None:
    analytics = LiveFeedAnalytics(ticker_ttl_seconds=60)
    analytics.record_event_view("e1", stock_ticker="aapl")
    time.sleep(0.01)
    analytics.touch_ticker("MSFT")
    active = analytics.active_tickers(max_symbols=10)
    assert active[0] == "MSFT"
    assert "AAPL" in active


def test_active_tickers_respect_max_symbols() -> None:
    analytics = LiveFeedAnalytics(ticker_ttl_seconds=300)
    for index, symbol in enumerate(["AAPL", "MSFT", "NVDA", "AMZN"]):
        analytics.touch_ticker(symbol)
        # Ensure distinct timestamps for ranking.
        analytics._viewed_tickers[symbol] = time.time() + index
    assert analytics.active_tickers(max_symbols=2) == ["AMZN", "NVDA"]


@pytest.mark.asyncio
async def test_bridge_emits_stock_quote_on_trade() -> None:
    analytics = LiveFeedAnalytics()
    analytics.touch_ticker("AAPL")
    bridge = AlpacaQuoteBridge(feed_analytics=analytics)
    bridge._event_index = {"AAPL": [("evt-1", "sp500-AAPL-0dte-2026-07-16-190")]}
    bridge._running = True

    with patch(
        "services.alpaca_quote_bridge.broadcast_stock_quote",
        new_callable=AsyncMock,
    ) as broadcast:
        await bridge._on_trade({"T": "t", "S": "AAPL", "p": 191.25})
        broadcast.assert_awaited()
        kwargs = broadcast.await_args.kwargs
        assert kwargs["stock_ticker"] == "AAPL"
        assert kwargs["last_price"] == 191.25
        assert kwargs["event_id"] == "evt-1"


@pytest.mark.asyncio
async def test_bridge_reconcile_subscribes_only_viewed() -> None:
    analytics = LiveFeedAnalytics()
    analytics.touch_ticker("AAPL")
    analytics.touch_ticker("MSFT")

    stream = MagicMock()
    stream._subscribed_trades = set()
    stream._subscribed_quotes = set()
    stream.subscribe = AsyncMock()
    stream.unsubscribe = AsyncMock()

    bridge = AlpacaQuoteBridge(feed_analytics=analytics)
    bridge._stream = stream
    bridge._running = True
    bridge._settings = MagicMock(alpaca_ws_max_symbols=30)

    await bridge.reconcile_subscriptions()
    stream.subscribe.assert_awaited()
    args = stream.subscribe.await_args.kwargs
    assert set(args["trades"]) == {"AAPL", "MSFT"}
