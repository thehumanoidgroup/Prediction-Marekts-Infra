"""Polymarket integration exceptions."""

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
