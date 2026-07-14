"""Schemas for account provisioning (admin, webhook, platform reporting)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

ProviderName = Literal["internal", "polymarket", "kalshi"]
ModelType = Literal["1step", "2step", "3step", "instant", "evaluation"]


class ChallengeRulesInput(BaseModel):
    """Per-issuance challenge rule overrides."""

    profit_target_pct: float | None = Field(None, ge=0.1, le=100)
    max_daily_loss_pct: float | None = Field(None, ge=0.1, le=100)
    max_drawdown_pct: float | None = Field(None, ge=0.1, le=100)
    drawdown_mode: Literal["static", "trailing", "absolute"] | None = None
    max_stake_per_order: float | None = Field(None, ge=1)
    max_exposure_per_market: float | None = Field(None, ge=1)
    max_total_exposure: float | None = Field(None, ge=1)
    min_consistency_score: float | None = Field(None, ge=0, le=1)
    min_trading_days: int | None = Field(None, ge=0, le=365)
    challenge_duration_days: int | None = Field(None, ge=1, le=730)
    profit_split_pct: float | None = Field(None, ge=1, le=100)


class ChallengeRulesPreview(BaseModel):
    """Resolved rules shown before issuance."""

    model_type: str
    account_size: float
    currency: str = "USD"
    profit_target_pct: float
    max_daily_loss_pct: float
    max_drawdown_pct: float
    drawdown_mode: str
    max_stake_per_order: float | None = None
    max_exposure_per_market: float | None = None
    max_total_exposure: float | None = None
    min_consistency_score: float | None = None
    min_trading_days: int
    challenge_duration_days: int
    profit_split_pct: float
    provider: str = "kalshi"


class ChallengeTemplateOut(BaseModel):
    """Existing challenge config / product template for copy."""

    id: str
    name: str
    provider: str
    prop_firm_account_id: str | None = None
    prop_firm_slug: str | None = None
    prop_firm_label: str | None = None
    rules: ChallengeRulesPreview


class ModelTypePresetOut(BaseModel):
    model_type: str
    label: str
    description: str
    rules: ChallengeRulesPreview


class ProvisionAccountRequest(BaseModel):
    """Manual issuance from the Prop Firm Admin dashboard."""

    email: EmailStr
    provider: ProviderName = "kalshi"
    account_size: int = Field(25_000, ge=10_000, le=2_000_000)
    display_name: str | None = None
    model_type: ModelType = "1step"
    template_config_id: str | None = None
    challenge_rules: ChallengeRulesInput | None = None
    prop_firm_account_slug: str | None = None
    kalshi_categories: list[str] | None = None
    send_credentials_email: bool = True
    replace_existing: bool = True


class PreviewRulesRequest(BaseModel):
    """Preview resolved challenge rules before issuing."""

    provider: ProviderName = "kalshi"
    account_size: int = Field(25_000, ge=10_000, le=2_000_000)
    model_type: ModelType = "1step"
    template_config_id: str | None = None
    challenge_rules: ChallengeRulesInput | None = None
    prop_firm_account_slug: str | None = None


class WebhookProvisionRequest(BaseModel):
    """Payload from a prop firm website purchase webhook."""

    email: EmailStr
    provider: ProviderName = "kalshi"
    account_size: int = Field(25_000, ge=10_000, le=2_000_000)
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
    display_name: str
    provider: str
    account_size: float
    model_type: str
    created_user: bool
    email_sent: bool
    credentials_generated: bool
    kalshi_market_tickers: list[str]
    temporary_password: str | None = None
    applied_rules: ChallengeRulesPreview


class SoldAccountOut(BaseModel):
    """Row in sold-accounts audit views."""

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
