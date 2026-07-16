"""Alpaca integration exceptions.

Exception hierarchy
-------------------
AlpacaError
    Base class for all integration failures.
AlpacaAuthError
    Missing or invalid ``ALPACA_API_KEY`` / ``ALPACA_SECRET_KEY``.
AlpacaApiError
    Non-success HTTP response from the Market Data API (``status_code`` set).
AlpacaTimeoutError
    Request exceeded the configured timeout.
AlpacaRateLimitError
    API returned HTTP 429 after retries were exhausted.
AlpacaWebSocketError
    Real-time IEX stream authentication or protocol failure.
"""

from __future__ import annotations

from typing import Any


class AlpacaError(Exception):
    """Base error for Alpaca integration failures."""

    def __init__(self, message: str, *, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class AlpacaAuthError(AlpacaError):
    """Raised when Alpaca API credentials are missing or rejected."""


class AlpacaApiError(AlpacaError):
    """Raised when the Alpaca Market Data API returns an error response."""

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


class AlpacaTimeoutError(AlpacaError):
    """Raised when an Alpaca request exceeds the configured timeout."""


class AlpacaRateLimitError(AlpacaApiError):
    """Raised when the Alpaca API returns HTTP 429 (rate limited)."""


class AlpacaWebSocketError(AlpacaError):
    """Raised when the Alpaca IEX WebSocket stream fails."""
