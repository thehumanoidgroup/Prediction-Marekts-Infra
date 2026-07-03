from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Tenant, User, UserRole
from app.runtime.store import TraderSession, get_trading_store

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_tenant(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Tenant:
    """Loads the tenant resolved by ``TenantContextMiddleware``."""
    slug: str | None = getattr(request.state, "tenant_slug", None)
    if not slug:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No tenant specified")

    result = await db.execute(select(Tenant).where(Tenant.slug == slug, Tenant.is_active))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Unknown tenant: {slug!r}")
    return tenant


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    """Authenticates the JWT and enforces tenant isolation."""
    if credentials is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = await db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    if user.role != UserRole.SUPER_ADMIN and user.tenant_id != tenant.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Token not valid for this tenant")

    return user


async def get_trader_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    """Returns the authenticated trader, or the tenant demo trader when unauthenticated."""
    if credentials is not None:
        return await get_current_user(db, tenant, credentials)

    result = await db.execute(
        select(User).where(
            User.tenant_id == tenant.id,
            User.role == UserRole.TRADER,
            User.is_active,
        )
    )
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No demo trader for tenant")
    return user


async def get_trader_session(
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_trader_user)],
) -> TraderSession:
    """Active trading session for the resolved trader."""
    return get_trading_store().get_session(tenant.slug, str(user.id), tenant.program or {})


def require_roles(*roles: UserRole):
    """Dependency factory for role-gated endpoints."""

    async def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role == UserRole.SUPER_ADMIN or user.role in roles:
            return user
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"Requires one of: {', '.join(r.value for r in roles)}",
        )

    return dependency
