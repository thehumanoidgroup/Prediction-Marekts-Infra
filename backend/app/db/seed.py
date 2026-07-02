"""Development seed data: demo tenants and one user per role.

Idempotent — safe to run on every startup; production deployments manage
tenants through the SuperAdmin API and Alembic migrations instead.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Tenant, User, UserRole

logger = logging.getLogger(__name__)

DEMO_PASSWORD = "demo-password-123"  # noqa: S105 - development seed only

SEED_TENANTS = [
    {
        "slug": "app",
        "name": "PropPredict",
        "tagline": "Trade predictions. Get funded.",
        "branding": {
            "accent": "#22c55e",
            "accent_hover": "#16a34a",
            "accent_soft": "rgba(34, 197, 94, 0.12)",
            "accent_foreground": "#04170b",
            "logo_glyph": "P",
        },
        "features": {"leaderboard": True, "journal": True, "payouts": True},
        "program": {
            "currency": "USD",
            "account_sizes": [10_000, 25_000, 50_000, 100_000],
            "profit_target_pct": 10,
            "max_daily_loss_pct": 5,
            "max_drawdown_pct": 10,
            "profit_split_pct": 80,
        },
    },
    {
        "slug": "apex",
        "name": "Apex Forecast",
        "tagline": "Elite forecasting capital.",
        "branding": {
            "accent": "#38bdf8",
            "accent_hover": "#0ea5e9",
            "accent_soft": "rgba(56, 189, 248, 0.12)",
            "accent_foreground": "#04121b",
            "logo_glyph": "A",
        },
        "features": {"leaderboard": True, "journal": True, "payouts": False},
        "program": {
            "currency": "USD",
            "account_sizes": [25_000, 50_000, 200_000],
            "profit_target_pct": 8,
            "max_daily_loss_pct": 4,
            "max_drawdown_pct": 8,
            "profit_split_pct": 90,
        },
    },
]


async def seed_database(db: AsyncSession) -> None:
    result = await db.execute(select(Tenant.id))
    if result.first() is not None:
        return

    logger.info("Seeding demo tenants and users")
    for spec in SEED_TENANTS:
        tenant = Tenant(**spec)
        db.add(tenant)
        await db.flush()

        db.add_all(
            [
                User(
                    tenant_id=tenant.id,
                    email=f"trader@{tenant.slug}.proppredict.com",
                    display_name="Demo Trader",
                    hashed_password=hash_password(DEMO_PASSWORD),
                    role=UserRole.TRADER,
                ),
                User(
                    tenant_id=tenant.id,
                    email=f"admin@{tenant.slug}.proppredict.com",
                    display_name="Firm Admin",
                    hashed_password=hash_password(DEMO_PASSWORD),
                    role=UserRole.PROP_FIRM_ADMIN,
                ),
            ]
        )

    # One platform operator, attached to the first tenant's slug for login.
    first = await db.execute(select(Tenant).where(Tenant.slug == "app"))
    app_tenant = first.scalar_one()
    db.add(
        User(
            tenant_id=app_tenant.id,
            email="root@proppredict.com",
            display_name="Super Admin",
            hashed_password=hash_password(DEMO_PASSWORD),
            role=UserRole.SUPER_ADMIN,
        )
    )
    await db.commit()
