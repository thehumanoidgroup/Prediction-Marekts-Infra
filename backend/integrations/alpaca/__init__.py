"""Alpaca Market Data (IEX free tier) integration for PropPredict.

This package provides:

- :class:`AlpacaClient` — async httpx REST client for stock pricing data
- :class:`AlpacaStockStream` — WebSocket handler for real-time IEX quotes/trades
- :class:`AlpacaService` — Redis-cached S&P 500 helpers for the MVP

Official docs
-------------
- Platform overview: https://alpaca.markets/docs/
- Market Data API: https://alpaca.markets/docs/api-references/market-data-api/
- Real-time stock pricing (WebSocket):
  https://alpaca.markets/docs/api-references/market-data-api/stock-pricing-data/realtime/

MVP note
--------
Uses the **Basic / free tier IEX feed** with paper-trading API keys.
Replace with a Polygon.io client when scaling beyond IEX coverage and
the free-tier rate limits (see comments in ``alpaca_client.py``).
"""

from .alpaca_client import (
    DEFAULT_DATA_BASE_URL,
    DEFAULT_IEX_STREAM_URL,
    AlpacaClient,
    AlpacaStockStream,
)
from .alpaca_service import AlpacaService, get_alpaca_service
from .exceptions import (
    AlpacaApiError,
    AlpacaAuthError,
    AlpacaError,
    AlpacaRateLimitError,
    AlpacaTimeoutError,
    AlpacaWebSocketError,
)
from .market_calendar import (
    is_trading_day,
    next_trading_day,
    next_weekly_expiration,
    session_phase,
    us_equity_today,
)
from .sp500_tickers import SP500_TICKERS

__all__ = [
    "DEFAULT_DATA_BASE_URL",
    "DEFAULT_IEX_STREAM_URL",
    "AlpacaApiError",
    "AlpacaAuthError",
    "AlpacaClient",
    "AlpacaError",
    "AlpacaRateLimitError",
    "AlpacaService",
    "AlpacaStockStream",
    "AlpacaTimeoutError",
    "AlpacaWebSocketError",
    "SP500_TICKERS",
    "get_alpaca_service",
    "is_trading_day",
    "next_trading_day",
    "next_weekly_expiration",
    "session_phase",
    "us_equity_today",
]
