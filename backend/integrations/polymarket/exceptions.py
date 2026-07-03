"""Polymarket integration exceptions.

Exception hierarchy
-------------------
PolymarketError
    Base class for all integration failures.
PolymarketAuthError
    Missing or invalid wallet / API credentials.
PolymarketApiError
    Non-success HTTP response from the CLOB API (``status_code`` set).
PolymarketTimeoutError
    SDK call exceeded ``PP_POLYMARKET_REQUEST_TIMEOUT_SECONDS``.
PolymarketRateLimitError
    CLOB returned HTTP 429 after retries were exhausted.
"""

from __future__ import annotations

from typing import Any


class PolymarketError(Exception):
    """Base error for Polymarket integration failures."""

    def __init__(self, message: str, *, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class PolymarketAuthError(PolymarketError):
    """Raised when authentication or credential derivation fails."""


class PolymarketApiError(PolymarketError):
    """Raised when the Polymarket CLOB API returns an error response."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_payload: Any = None,
        cause: Exception | None = None,
    ) -> None:
        super().__init__(message, cause=cause)
        self.status_code = status_code
        self.error_payload = error_payload


class PolymarketTimeoutError(PolymarketError):
    """Raised when a Polymarket SDK call exceeds the configured timeout."""


class PolymarketRateLimitError(PolymarketApiError):
    """Raised when the Polymarket CLOB API returns HTTP 429 (rate limited)."""
