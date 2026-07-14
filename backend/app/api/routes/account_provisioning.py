"""Account provisioning endpoints: admin manual issuance, webhooks, sold-account reporting."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant, get_firm_admin_user, require_roles
from app.core.config import get_settings
from app.db.session import get_db
from app.models import IssuanceSource, SoldAccount, Tenant, User, UserRole
from app.schemas.account_provisioning import (
    ProvisionAccountRequest,
    ProvisionAccountResponse,
    SoldAccountOut,
    WebhookProvisionRequest,
)
from services.account_provisioning import list_sold_accounts, provision_new_account

router = APIRouter(tags=["account-provisioning"])


def _to_provision_response(result) -> ProvisionAccountResponse:
    return ProvisionAccountResponse(
        user_id=result.user.id,
        account_id=result.account.id,
        sold_record_id=result.sold_record.id,
        email=result.user.email,
        provider=result.account.provider.value,
        account_size=result.account.starting_balance,
        created_user=result.created_user,
        email_sent=result.email_sent,
        kalshi_market_tickers=result.kalshi_market_tickers,
        temporary_password=result.temporary_password,
    )


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

    return [
        SoldAccountOut(
            id=r.id,
            created_at=r.created_at.isoformat(),
            tenant_id=r.tenant_id,
            tenant_slug=tenants_by_id[r.tenant_id].slug if r.tenant_id in tenants_by_id else None,
            tenant_name=tenants_by_id[r.tenant_id].name if r.tenant_id in tenants_by_id else None,
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
        for r in records
    ]
