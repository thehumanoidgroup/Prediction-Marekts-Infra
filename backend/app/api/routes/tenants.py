from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant, require_roles
from app.db.session import get_db
from app.models import Tenant, User, UserRole
from app.models.tenant import DEFAULT_BRANDING, DEFAULT_FEATURES, DEFAULT_PROGRAM
from app.schemas.tenant import TenantBrandingUpdate, TenantCreate, TenantResponse

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/current", response_model=TenantResponse)
async def current_tenant(tenant: Annotated[Tenant, Depends(get_current_tenant)]) -> Tenant:
    """Public white-label config for the requesting firm.

    The frontend calls this on boot to theme itself (colors, name, logo,
    feature flags) — no authentication required.
    """
    return tenant


@router.patch("/current", response_model=TenantResponse)
async def update_current_tenant(
    body: TenantBrandingUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _admin: Annotated[User, Depends(require_roles(UserRole.PROP_FIRM_ADMIN))],
) -> Tenant:
    """Firm admins update their own branding, features and program rules."""
    updates = body.model_dump(exclude_none=True)
    for key in ("branding", "features", "program"):
        if key in updates:
            # Merge partial JSON updates instead of replacing the whole blob.
            updates[key] = {**getattr(tenant, key), **updates[key]}
    for key, value in updates.items():
        setattr(tenant, key, value)
    await db.commit()
    await db.refresh(tenant)
    return tenant


@router.get("", response_model=list[TenantResponse])
async def list_tenants(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
) -> list[Tenant]:
    result = await db.execute(select(Tenant).order_by(Tenant.created_at))
    return list(result.scalars())


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
) -> Tenant:
    """Onboard a new prop firm (SuperAdmin only)."""
    existing = await db.execute(select(Tenant).where(Tenant.slug == body.slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Slug already taken")

    tenant = Tenant(
        slug=body.slug,
        name=body.name,
        tagline=body.tagline,
        branding=body.branding or dict(DEFAULT_BRANDING),
        features=body.features or dict(DEFAULT_FEATURES),
        program=body.program or dict(DEFAULT_PROGRAM),
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant
