from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Tenant, User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_tenant(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Tenant:
    """Loads the tenant resolved by ``TenantContextMiddleware``.

    The middleware extracts the slug (X-Tenant-Slug header, then Host
    subdomain); this dependency validates it against the database and
    404s unknown or deactivated firms.
    """
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
    """Authenticates the JWT and enforces tenant isolation.

    A token minted for one firm is rejected on another firm's domain —
    except for SUPER_ADMINs, who operate across tenants.
    """
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


def require_roles(*roles: UserRole):
    """Dependency factory for role-gated endpoints.

    SUPER_ADMIN implicitly passes every check.
    """

    async def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role == UserRole.SUPER_ADMIN or user.role in roles:
            return user
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"Requires one of: {', '.join(r.value for r in roles)}",
        )

    return dependency
