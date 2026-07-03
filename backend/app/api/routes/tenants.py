from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant, get_firm_admin_user, require_roles
from app.db.session import get_db
from app.models import Tenant, User, UserRole
from app.models.tenant import DEFAULT_BRANDING, DEFAULT_FEATURES, DEFAULT_PROGRAM
from app.schemas.tenant import TenantCreate, TenantResponse
from app.schemas.tenant_config import TenantBrandingPatch, TenantConfigOut, patch_to_db_fields, tenant_to_config

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/current", response_model=TenantConfigOut)
async def current_tenant(tenant: Annotated[Tenant, Depends(get_current_tenant)]) -> TenantConfigOut:
    """Public white-label config for the requesting firm (camelCase JSON)."""
    return tenant_to_config(tenant)


@router.patch("/current", response_model=TenantConfigOut)
async def update_current_tenant(
    body: TenantBrandingPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _admin: Annotated[User, Depends(get_firm_admin_user)],
) -> TenantConfigOut:
    """Firm admins update branding, features, and program rules."""
    updates = patch_to_db_fields(body)
    for key in ("branding", "features", "program"):
        if key in updates:
            updates[key] = {**getattr(tenant, key), **updates[key]}
    for key, value in updates.items():
        setattr(tenant, key, value)
    await db.commit()
    await db.refresh(tenant)
    return tenant_to_config(tenant)


@router.get("", response_model=list[TenantConfigOut])
async def list_tenants(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
) -> list[TenantConfigOut]:
    result = await db.execute(select(Tenant).order_by(Tenant.created_at))
    return [tenant_to_config(t) for t in result.scalars()]


@router.post("", response_model=TenantConfigOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
) -> TenantConfigOut:
    """Onboard a new prop firm (SuperAdmin only)."""
    existing = await db.execute(select(Tenant).where(Tenant.slug == body.slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Slug already taken")

    client_key = body.slug
    tenant = Tenant(
        slug=body.slug,
        client_key=client_key,
        name=body.name,
        tagline=body.tagline,
        branding=body.branding or dict(DEFAULT_BRANDING),
        features=body.features or dict(DEFAULT_FEATURES),
        program=body.program or dict(DEFAULT_PROGRAM),
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant_to_config(tenant)
