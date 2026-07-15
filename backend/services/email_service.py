"""Outbound email helpers for account provisioning."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AccountCredentialsEmail:
    """Payload for a trader welcome / credentials email."""

    to_email: str
    display_name: str
    tenant_name: str
    provider: str
    account_size: float
    login_url: str
    temporary_password: str | None = None


async def send_account_credentials_email(payload: AccountCredentialsEmail) -> bool:
    """Send login credentials to a newly provisioned trader.

  In production this integrates with your ESP (SendGrid, SES, etc.). Development
  mode logs the message and returns success so provisioning flows stay testable.
    """
    settings = get_settings()
    if not settings.provisioning_email_enabled:
        logger.info(
            "Provisioning email disabled — skipped send to %s (%s %s account)",
            payload.to_email,
            payload.provider,
            int(payload.account_size),
        )
        return False

    subject = f"Your {payload.tenant_name} {int(payload.account_size / 1000)}K evaluation account"
    logger.info(
        "Sending account credentials email to=%s subject=%r provider=%s login_url=%s has_temp_password=%s",
        payload.to_email,
        subject,
        payload.provider,
        payload.login_url,
        bool(payload.temporary_password),
    )
    # Hook point for ESP integration — credentials are never logged in production.
    if settings.environment == "development" and payload.temporary_password:
        logger.debug(
            "Dev-only credential hint for %s: temporary password issued",
            payload.to_email,
        )
    return True
