"""Polymarket CLOB integration for PropPredict.

This package wraps the official ``py-clob-client-v2`` SDK with:

- :class:`PolymarketClient` — async-friendly low-level CLOB access
- :class:`PolymarketService` — cached market discovery + normalization
- Typed exceptions for API, auth, and timeout failures

Read :doc:`README` in this directory for configuration, REST endpoints,
and usage examples.
"""

from .exceptions import (
    PolymarketApiError,
    PolymarketAuthError,
    PolymarketError,
    PolymarketTimeoutError,
)
from .polymarket_client import (
    DEFAULT_CHAIN_ID,
    DEFAULT_HOST,
    L0,
    L1,
    L2,
    MarketsPage,
    PolymarketClient,
)
from .polymarket_service import (
    PolymarketService,
    get_polymarket_service,
    normalize_polymarket_market,
)

__all__ = [
    "DEFAULT_CHAIN_ID",
    "DEFAULT_HOST",
    "L0",
    "L1",
    "L2",
    "MarketsPage",
    "PolymarketApiError",
    "PolymarketAuthError",
    "PolymarketClient",
    "PolymarketError",
    "PolymarketService",
    "PolymarketTimeoutError",
    "get_polymarket_service",
    "normalize_polymarket_market",
]
