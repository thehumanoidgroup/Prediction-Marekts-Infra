"""Outbound email helpers for account provisioning.

Mirrors the Next.js ``services/email.ts`` / ``lib/email/templates.ts`` flow.
In development the message is logged; production hooks into your ESP
(SendGrid, SES, Resend, etc.).
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
    support_contact: str | None = None


@dataclass(frozen=True, slots=True)
class PropFirmIssuanceCopyEmail:
    """Optional confirmation copy for the issuing prop firm admin."""

    to_email: str
    tenant_name: str
    trader_email: str
    provider: str
    account_size: float
    model_type: str = "1step"
    account_id: str | None = None
    challenge_rules: dict[str, Any] = field(default_factory=dict)
    issued_by_name: str | None = None
    dashboard_url: str | None = None
    support_contact: str | None = None


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


def trader_credentials_subject(tenant_name: str) -> str:
    return f"Your {tenant_name} Prediction Markets Account is Ready"


def render_credentials_email_text(payload: AccountCredentialsEmail) -> str:
    """Plain-text trader welcome body used for logs and ESP integration."""
    size_k = int(payload.account_size / 1000)
    dashboard = payload.dashboard_url or payload.login_url
    rules = _rules_summary(payload.challenge_rules)
    rules_block = "\n".join(f"  - {line}" for line in rules) or "  - See firm challenge template"
    support = payload.support_contact or "support@proppredict.com"

    if payload.magic_link:
        creds = f"Magic link: {payload.magic_link}"
    elif payload.temporary_password:
        creds = (
            f"Username: {payload.to_email}\n"
            f"Password: {payload.temporary_password}\n"
            f"Login link: {payload.login_url}"
        )
    else:
        creds = f"Login link: {payload.login_url}"

    return (
        f"Your {payload.tenant_name} Prediction Markets Account is Ready\n\n"
        f"Hi {payload.display_name},\n\n"
        f"Your prediction markets evaluation account has been issued. "
        f"Use the details below to sign in and start trading.\n\n"
        f"Account details\n"
        f"  Model type: {_format_model(payload.model_type)}\n"
        f"  Account size: ${size_k}K (${int(payload.account_size):,})\n"
        f"  Provider: {_format_provider(payload.provider)}\n\n"
        f"Challenge rules\n{rules_block}\n\n"
        f"Login credentials\n{creds}\n\n"
        f"Trader Dashboard\n{dashboard}\n\n"
        f"Support contact: {support}\n"
    )


def render_prop_firm_issuance_copy_text(payload: PropFirmIssuanceCopyEmail) -> str:
    """Plain-text optional confirmation for the issuing admin."""
    size_k = int(payload.account_size / 1000)
    rules = _rules_summary(payload.challenge_rules)
    rules_block = "\n".join(f"  - {line}" for line in rules) or "  - See firm challenge template"
    support = payload.support_contact or "support@proppredict.com"
    issued = f"\n  Issued by: {payload.issued_by_name}" if payload.issued_by_name else ""
    account_id = f"\n  Account ID: {payload.account_id}" if payload.account_id else ""
    dashboard = f"\n\nTrader Dashboard\n{payload.dashboard_url}" if payload.dashboard_url else ""

    return (
        f"Account issuance confirmation — {payload.tenant_name}\n\n"
        f"A prediction markets evaluation account was issued. "
        f"Login credentials were emailed to the trader.\n\n"
        f"Issuance summary\n"
        f"  Trader: {payload.trader_email}\n"
        f"  Model type: {_format_model(payload.model_type)}\n"
        f"  Account size: ${size_k}K (${int(payload.account_size):,})\n"
        f"  Provider: {_format_provider(payload.provider)}"
        f"{account_id}{issued}\n\n"
        f"Challenge rules applied\n{rules_block}"
        f"{dashboard}\n\n"
        f"Support contact: {support}\n"
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

    subject = trader_credentials_subject(payload.tenant_name)
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


async def send_prop_firm_issuance_copy(payload: PropFirmIssuanceCopyEmail) -> bool:
    """Optional confirmation copy for the prop firm admin who issued the account."""
    settings = get_settings()
    if not settings.provisioning_email_enabled:
        logger.info(
            "Provisioning email disabled — skipped firm copy to %s for trader %s",
            payload.to_email,
            payload.trader_email,
        )
        return False

    size_k = int(payload.account_size / 1000)
    subject = (
        f"Account issued: {payload.trader_email} · "
        f"${size_k}K {_format_model(payload.model_type)}"
    )
    body = render_prop_firm_issuance_copy_text(payload)

    logger.info(
        "Sending prop firm issuance copy to=%s subject=%r trader=%s provider=%s",
        payload.to_email,
        subject,
        payload.trader_email,
        payload.provider,
    )
    if settings.environment == "development":
        logger.debug("Dev firm issuance copy for %s:\n%s", payload.to_email, body)

    return True
