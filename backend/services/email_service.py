"""Outbound email helpers for account provisioning.

Mirrors the Next.js ``services/email.ts`` provisioning flow. In development the
message is logged; production hooks into your ESP (SendGrid, SES, Resend, etc.).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

PROVIDER_LABELS = {
    "internal": "Internal LMSR",
    "polymarket": "Polymarket",
    "kalshi": "Kalshi",
    "sp500_dynamic": "S&P 500 Dynamic Markets",
}

MODEL_LABELS = {
    "1step": "1-Step Evaluation",
    "2step": "2-Step Evaluation",
    "3step": "3-Step Evaluation",
    "instant": "Instant Funding",
}


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
    model_type: str = "1step"
    dashboard_url: str | None = None
    challenge_rules: dict[str, Any] = field(default_factory=dict)
    magic_link: str | None = None


def _format_provider(provider: str) -> str:
    return PROVIDER_LABELS.get(provider, provider)


def _format_model(model_type: str) -> str:
    return MODEL_LABELS.get(model_type, model_type)


def _rules_summary(rules: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    mapping = [
        ("profit_target_pct", "Profit target", "%"),
        ("max_daily_loss_pct", "Daily drawdown limit", "%"),
        ("max_drawdown_pct", "Max drawdown", "%"),
        ("drawdown_mode", "Drawdown mode", ""),
        ("min_trading_days", "Minimum trading days", ""),
        ("challenge_duration_days", "Challenge duration", " days"),
        ("profit_split_pct", "Profit split", "%"),
        ("max_stake_per_order", "Max stake per order", ""),
    ]
    for key, label, suffix in mapping:
        if key not in rules or rules[key] is None:
            continue
        value = rules[key]
        if suffix == "%" and isinstance(value, (int, float)):
            lines.append(f"{label}: {value}{suffix}")
        elif suffix == " days" and isinstance(value, (int, float)):
            lines.append(f"{label}: {int(value)}{suffix}")
        else:
            lines.append(f"{label}: {value}")
    return lines


def render_credentials_email_text(payload: AccountCredentialsEmail) -> str:
    """Plain-text body used for logs and ESP integration."""
    size_k = int(payload.account_size / 1000)
    dashboard = payload.dashboard_url or payload.login_url
    rules = _rules_summary(payload.challenge_rules)
    rules_block = "\n".join(f"  - {line}" for line in rules) or "  - See firm challenge template"

    if payload.magic_link:
        creds = f"Magic link: {payload.magic_link}"
    elif payload.temporary_password:
        creds = (
            f"Username: {payload.to_email}\n"
            f"Temporary password: {payload.temporary_password}\n"
            f"Login: {payload.login_url}"
        )
    else:
        creds = f"Login: {payload.login_url}"

    return (
        f"{payload.tenant_name} — Your evaluation account is ready\n\n"
        f"Hi {payload.display_name},\n\n"
        f"Model type: {_format_model(payload.model_type)}\n"
        f"Account size: ${size_k}K (${int(payload.account_size):,})\n"
        f"Provider: {_format_provider(payload.provider)}\n\n"
        f"Challenge rules:\n{rules_block}\n\n"
        f"Login credentials:\n{creds}\n\n"
        f"Trader Dashboard:\n{dashboard}\n"
    )


async def send_account_credentials_email(payload: AccountCredentialsEmail) -> bool:
    """Send login credentials to a newly provisioned trader.

    Called automatically after Prop Firm Admin issuance when
    ``send_credentials_email`` is true (default).
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

    size_k = int(payload.account_size / 1000)
    subject = f"Your {payload.tenant_name} {size_k}K evaluation account is ready"
    body = render_credentials_email_text(payload)

    logger.info(
        "Sending account credentials email to=%s subject=%r provider=%s "
        "model=%s login_url=%s dashboard_url=%s has_temp_password=%s has_magic_link=%s",
        payload.to_email,
        subject,
        payload.provider,
        payload.model_type,
        payload.login_url,
        payload.dashboard_url,
        bool(payload.temporary_password),
        bool(payload.magic_link),
    )
    if settings.environment == "development":
        logger.debug("Dev credentials email body for %s:\n%s", payload.to_email, body)

    # Hook point for ESP integration — never log raw passwords in production.
    return True
