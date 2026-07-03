"""White-label tenant configuration schemas (camelCase for the frontend)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.tenant import DEFAULT_BRANDING, DEFAULT_FEATURES, DEFAULT_PROGRAM, Tenant


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class TenantBrandingOut(CamelModel):
    accent: str
    accent_hover: str
    accent_soft: str
    accent_foreground: str
    logo_glyph: str
    logo_url: str | None = None


class TenantFeaturesOut(CamelModel):
    leaderboard: bool = True
    journal: bool = True
    payouts: bool = True


class TenantProgramOut(CamelModel):
    currency: str = "USD"
    account_sizes: list[int] = Field(default_factory=lambda: [10_000, 25_000, 50_000])
    profit_target_pct: float = 10.0
    max_daily_loss_pct: float = 5.0
    max_drawdown_pct: float = 10.0
    drawdown_mode: str = "static"
    profit_split_pct: float = 80.0
    max_stake_per_order: float = 2_500.0
    max_exposure_per_market: float = 5_000.0
    challenge_duration_days: int = 60
    min_trading_days: int = 10


class TenantConfigOut(CamelModel):
    """Full white-label config consumed by all frontend dashboards."""

    id: str
    slug: str
    name: str
    tagline: str
    is_active: bool = True
    branding: TenantBrandingOut
    features: TenantFeaturesOut
    program: TenantProgramOut


class TenantBrandingPatch(CamelModel):
    """Partial update from the firm admin branding studio."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    tagline: str | None = Field(default=None, max_length=255)
    branding: dict[str, Any] | None = None
    features: dict[str, Any] | None = None
    program: dict[str, Any] | None = None


def _merge(defaults: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    return {**defaults, **(overrides or {})}


def _camel_to_snake(key: str) -> str:
    out: list[str] = []
    for i, ch in enumerate(key):
        if ch.isupper() and i > 0:
            out.append("_")
        out.append(ch.lower())
    return "".join(out)


def patch_to_db_fields(body: TenantBrandingPatch) -> dict[str, Any]:
    """Convert a camelCase patch payload into snake_case DB column updates."""
    raw = body.model_dump(exclude_none=True, by_alias=False)
    updates: dict[str, Any] = {}
    for key, value in raw.items():
        if key in ("branding", "features", "program") and isinstance(value, dict):
            updates[key] = {_camel_to_snake(k): v for k, v in value.items()}
        else:
            updates[key] = value
    return updates


def tenant_to_config(tenant: Tenant) -> TenantConfigOut:
    """Materialize a DB tenant row into the frontend contract."""
    branding = _merge(DEFAULT_BRANDING, tenant.branding)
    features = _merge(DEFAULT_FEATURES, tenant.features)
    program = _merge(DEFAULT_PROGRAM, tenant.program)

    client_id = tenant.client_key or tenant.slug

    return TenantConfigOut(
        id=client_id,
        slug=tenant.slug,
        name=tenant.name,
        tagline=tenant.tagline,
        is_active=tenant.is_active,
        branding=TenantBrandingOut(
            accent=branding["accent"],
            accent_hover=branding["accent_hover"],
            accent_soft=branding["accent_soft"],
            accent_foreground=branding["accent_foreground"],
            logo_glyph=branding.get("logo_glyph", "P"),
            logo_url=branding.get("logo_url"),
        ),
        features=TenantFeaturesOut(**{k: bool(features.get(k, v)) for k, v in DEFAULT_FEATURES.items()}),
        program=TenantProgramOut(
            currency=program.get("currency", "USD"),
            account_sizes=program.get("account_sizes", DEFAULT_PROGRAM["account_sizes"]),
            profit_target_pct=float(program.get("profit_target_pct", 10)),
            max_daily_loss_pct=float(program.get("max_daily_loss_pct", 5)),
            max_drawdown_pct=float(program.get("max_drawdown_pct", 10)),
            drawdown_mode=program.get("drawdown_mode", "static"),
            profit_split_pct=float(program.get("profit_split_pct", 80)),
            max_stake_per_order=float(program.get("max_stake_per_order", 2_500)),
            max_exposure_per_market=float(program.get("max_exposure_per_market", 5_000)),
            challenge_duration_days=int(program.get("challenge_duration_days", 60)),
            min_trading_days=int(program.get("min_trading_days", 10)),
        ),
    )
