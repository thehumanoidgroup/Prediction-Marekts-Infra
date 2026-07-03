from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Tenant, User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> TokenResponse:
    """Self-service trader signup, scoped to the requesting firm.

    Admin accounts are provisioned by higher-privileged users, never here.
    """
    existing = await db.execute(
        select(User).where(User.tenant_id == tenant.id, User.email == body.email.lower())
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        tenant_id=tenant.id,
        email=body.email.lower(),
        display_name=body.display_name,
        hashed_password=hash_password(body.password),
        role=UserRole.TRADER,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user_id=user.id, tenant_id=tenant.id, role=user.role.value)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> TokenResponse:
    result = await db.execute(
        select(User).where(User.tenant_id == tenant.id, User.email == body.email.lower())
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    token = create_access_token(user_id=user.id, tenant_id=user.tenant_id, role=user.role.value)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
