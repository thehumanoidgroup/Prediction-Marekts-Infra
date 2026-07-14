"""Schemas for account provisioning (admin, webhook, platform reporting)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

ProviderName = Literal["internal", "polymarket", "kalshi"]


class ProvisionAccountRequest(BaseModel):
    """Manual issuance from the Prop Firm Admin dashboard."""

    email: EmailStr
    provider: ProviderName = "internal"
    account_size: int = Field(25_000, ge=1_000, le=500_000)
    display_name: str | None = None
    prop_firm_account_slug: str | None = None
    kalshi_categories: list[str] | None = None
    send_credentials_email: bool = True
    replace_existing: bool = True


class WebhookProvisionRequest(BaseModel):
    """Payload from a prop firm website purchase webhook."""

    email: EmailStr
    provider: ProviderName = "kalshi"
    account_size: int = Field(25_000, ge=1_000, le=500_000)
    display_name: str | None = None
    external_order_id: str | None = None
    kalshi_categories: list[str] | None = None
    metadata: dict[str, Any] | None = None


class ProvisionAccountResponse(BaseModel):
    """Outcome returned to admins and webhook callers."""

    user_id: str
    account_id: str
    sold_record_id: str
    email: str
    provider: str
    account_size: float
    created_user: bool
    email_sent: bool
    kalshi_market_tickers: list[str]
    temporary_password: str | None = None


class SoldAccountOut(BaseModel):
    """Row in the Super Admin Sold Accounts view."""

    id: str
    created_at: str
    tenant_id: str
    tenant_slug: str | None = None
    tenant_name: str | None = None
    user_id: str
    trader_demo_account_id: str | None
    provider: str
    issuance_source: str
    account_size: float
    model_type: str
    trader_email: str
    trader_display_name: str
    external_order_id: str | None
    kalshi_market_tickers: list[str] | None
    credentials_generated: bool
    email_sent: bool
    issued_by_user_id: str | None
