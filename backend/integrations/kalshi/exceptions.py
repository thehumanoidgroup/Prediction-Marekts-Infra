"""Kalshi integration exceptions.

Exception hierarchy
-------------------
KalshiError
    Base class for all integration failures.
KalshiAuthError
    Missing or invalid API key / RSA private key.
KalshiApiError
    Non-success HTTP response from the Trading API (``status_code`` set).
KalshiTimeoutError
    Request exceeded ``PP_KALSHI_REQUEST_TIMEOUT_SECONDS``.
KalshiRateLimitError
    API returned HTTP 429 after retries were exhausted.
"""

from __future__ import annotations

from typing import Any


class KalshiError(Exception):
    """Base error for Kalshi integration failures."""

    def __init__(self, message: str, *, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class KalshiAuthError(KalshiError):
    """Raised when authentication or request signing fails."""


class KalshiApiError(KalshiError):
    """Raised when the Kalshi Trading API returns an error response."""

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


class KalshiTimeoutError(KalshiError):
    """Raised when a Kalshi request exceeds the configured timeout."""


class KalshiRateLimitError(KalshiApiError):
    """Raised when the Kalshi API returns HTTP 429 (rate limited)."""
