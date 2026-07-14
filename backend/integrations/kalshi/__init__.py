"""Kalshi Trading API integration for PropPredict.

This package provides:

- :class:`KalshiClient` — async httpx client with RSA-PSS request signing
- :class:`KalshiService` — cached market discovery, normalization, live prices
- Typed exceptions for API, auth, timeout, and rate-limit failures

Read ``README.md`` in this directory for configuration, REST endpoints,
and usage examples.
"""

from .exceptions import (
    KalshiApiError,
    KalshiAuthError,
    KalshiError,
    KalshiRateLimitError,
    KalshiTimeoutError,
)
from .kalshi_client import (
    DEFAULT_DEMO_BASE_URL,
    DEFAULT_PRODUCTION_BASE_URL,
    KalshiClient,
    MarketsPage,
)
from .kalshi_service import (
    KalshiService,
    get_kalshi_service,
    normalize_kalshi_market,
)

__all__ = [
    "DEFAULT_DEMO_BASE_URL",
    "DEFAULT_PRODUCTION_BASE_URL",
    "KalshiApiError",
    "KalshiAuthError",
    "KalshiClient",
    "KalshiError",
    "KalshiRateLimitError",
    "KalshiService",
    "KalshiTimeoutError",
    "MarketsPage",
    "get_kalshi_service",
    "normalize_kalshi_market",
]
