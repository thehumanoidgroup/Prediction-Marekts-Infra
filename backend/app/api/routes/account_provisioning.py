"""Account provisioning endpoints: admin manual issuance, webhooks, sold-account reporting."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant, get_firm_admin_user, require_roles
from app.core.config import get_settings
from app.db.session import get_db
from app.models import IssuanceSource, MarketProvider, SoldAccount, Tenant, User, UserRole
from app.schemas.account_provisioning import (
    ChallengeRulesPreview,
    ChallengeTemplateOut,
    ModelTypePresetOut,
    PreviewRulesRequest,
    ProvisionAccountRequest,
    ProvisionAccountResponse,
    SoldAccountOut,
    WebhookProvisionRequest,
)
from services.account_provisioning import (
    list_challenge_templates,
    list_model_type_presets,
    list_sold_accounts,
    preview_issuance_rules,
    provision_new_account,
)

router = APIRouter(tags=["account-provisioning"])


def _to_provision_response(result) -> ProvisionAccountResponse:
    provider = result.account.provider.value
    kalshi_enabled = provider == "kalshi" and bool(result.kalshi_market_tickers)
    if provider == "kalshi":
        message = f"Kalshi evaluation account {result.account.id} issued to {result.user.email}"
    elif provider == "sp500_dynamic":
        message = (
            f"S&P 500 Dynamic Markets account {result.account.id} issued to {result.user.email}"
        )
    else:
        message = f"Evaluation account {result.account.id} issued to {result.user.email}"
    return ProvisionAccountResponse(
        message=message,
        user_id=result.user.id,
        account_id=result.account.id,
        trader_demo_account_id=result.account.id,
        sold_record_id=result.sold_record.id,
        email=result.user.email,
        display_name=result.user.display_name,
        provider=provider,
        account_size=result.account.starting_balance,
        model_type=result.account.model_type,
        created_user=result.created_user,
        email_sent=result.email_sent,
        credentials_generated=bool(result.temporary_password),
        kalshi_live_integration_enabled=kalshi_enabled,
        kalshi_market_tickers=result.kalshi_market_tickers,
        temporary_password=result.temporary_password,
        applied_rules=ChallengeRulesPreview.model_validate(result.applied_rules),
    )


def _sold_row(r: SoldAccount, tenant: Tenant | None = None) -> SoldAccountOut:
    return SoldAccountOut(
        id=r.id,
        created_at=r.created_at.isoformat(),
        tenant_id=r.tenant_id,
        tenant_slug=tenant.slug if tenant else None,
        tenant_name=tenant.name if tenant else None,
        user_id=r.user_id,
        trader_demo_account_id=r.trader_demo_account_id,
        provider=r.provider.value,
        issuance_source=r.issuance_source.value,
        account_size=r.account_size,
        model_type=r.model_type,
        trader_email=r.trader_email,
        trader_display_name=r.trader_display_name,
        external_order_id=r.external_order_id,
        kalshi_market_tickers=r.kalshi_market_tickers,
        credentials_generated=r.credentials_generated,
        email_sent=r.email_sent,
        issued_by_user_id=r.issued_by_user_id,
    )


@router.get("/admin/accounts/templates", response_model=list[ChallengeTemplateOut])
async def admin_challenge_templates(
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _admin: Annotated[User, Depends(get_firm_admin_user)],
    provider: str = Query("kalshi"),
) -> list[ChallengeTemplateOut]:
    """Prop Firm Admin: list challenge templates to copy rules from."""
    try:
        resolved = MarketProvider(provider)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid provider") from exc

    templates = await list_challenge_templates(db, tenant_id=tenant.id, provider=resolved)
    return [ChallengeTemplateOut.model_validate(t) for t in templates]


@router.get("/admin/accounts/model-presets", response_model=list[ModelTypePresetOut])
async def admin_model_presets(
    _admin: Annotated[User, Depends(get_firm_admin_user)],
    account_size: int = Query(25_000, ge=10_000, le=2_000_000),
    provider: str = Query("kalshi"),
) -> list[ModelTypePresetOut]:
    """Built-in 1-step / 2-step / 3-step / instant model presets."""
    presets = list_model_type_presets(account_size=account_size, provider=provider)
    return [ModelTypePresetOut.model_validate(p) for p in presets]


@router.post("/admin/accounts/preview-rules", response_model=ChallengeRulesPreview)
async def admin_preview_rules(
    body: PreviewRulesRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _admin: Annotated[User, Depends(get_firm_admin_user)],
) -> ChallengeRulesPreview:
    """Preview resolved challenge rules before issuing an account."""
    try:
        provider = MarketProvider(body.provider)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid provider") from exc

    overrides = body.challenge_rules.model_dump(exclude_none=True) if body.challenge_rules else None
    preview = await preview_issuance_rules(
        db,
        tenant=tenant,
        provider=provider,
        account_size=body.account_size,
        model_type=body.model_type,
        template_config_id=body.template_config_id,
        challenge_rules=overrides,
        prop_firm_account_slug=body.prop_firm_account_slug,
    )
    return ChallengeRulesPreview.model_validate(preview)


@router.get("/admin/accounts/sold", response_model=list[SoldAccountOut])
async def admin_sold_accounts(
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _admin: Annotated[User, Depends(get_firm_admin_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[SoldAccountOut]:
    """Prop Firm Admin: tenant-scoped sold account audit log."""
    records = await list_sold_accounts(db, tenant_id=tenant.id, limit=limit)
    return [_sold_row(r, tenant) for r in records]


@router.post(
    "/admin/accounts/provision",
    response_model=ProvisionAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def admin_provision_account(
    body: ProvisionAccountRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    admin: Annotated[User, Depends(get_firm_admin_user)],
) -> ProvisionAccountResponse:
    """Prop Firm Admin: manually issue an evaluation account to a new or existing trader."""
    overrides = body.challenge_rules.model_dump(exclude_none=True) if body.challenge_rules else None
    result = await provision_new_account(
        db,
        tenant=tenant,
        email=body.email,
        provider=body.provider,
        account_size=body.account_size,
        display_name=body.display_name,
        issuance_source=IssuanceSource.MANUAL,
        prop_firm_account_slug=body.prop_firm_account_slug,
        kalshi_categories=body.kalshi_categories,
        replace_existing=body.replace_existing,
        issued_by_user_id=admin.id,
        send_credentials_email=body.send_credentials_email,
        model_type=body.model_type,
        template_config_id=body.template_config_id,
        challenge_rules=overrides,
    )
    await db.commit()
    return _to_provision_response(result)


@router.post(
    "/webhooks/accounts",
    response_model=ProvisionAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
async def webhook_provision_account(
    body: WebhookProvisionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    x_webhook_secret: Annotated[str | None, Header(alias="X-Webhook-Secret")] = None,
) -> ProvisionAccountResponse:
    """Prop firm website webhook: auto-provision after a purchase."""
    settings = get_settings()
    if settings.webhook_secret:
        if not x_webhook_secret or x_webhook_secret != settings.webhook_secret:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook secret")

    overrides = body.challenge_rules.model_dump(exclude_none=True) if body.challenge_rules else None
    result = await provision_new_account(
        db,
        tenant=tenant,
        email=body.email,
        provider=body.provider,
        account_size=body.account_size,
        display_name=body.display_name,
        issuance_source=IssuanceSource.WEBHOOK,
        kalshi_categories=body.kalshi_categories,
        external_order_id=body.external_order_id,
        metadata=body.metadata,
        replace_existing=True,
        send_credentials_email=True,
        model_type=body.model_type,
        template_config_id=body.template_config_id,
        challenge_rules=overrides,
    )
    await db.commit()
    return _to_provision_response(result)


@router.get("/platform/sold-accounts", response_model=list[SoldAccountOut])
async def platform_sold_accounts(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    tenant_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[SoldAccountOut]:
    """Super Admin: audit log of all issued evaluation accounts."""
    records = await list_sold_accounts(db, tenant_id=tenant_id, limit=limit)
    if not records:
        return []

    tenant_ids = {r.tenant_id for r in records}
    tenants_result = await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))
    tenants_by_id = {t.id: t for t in tenants_result.scalars().all()}

    return [_sold_row(r, tenants_by_id.get(r.tenant_id)) for r in records]
