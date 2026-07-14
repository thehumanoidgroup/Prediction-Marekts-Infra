"""Development seed data: demo tenants and one user per role."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Tenant, User, UserRole
from services.account_provisioning import ensure_tenant_account_catalog, provision_trader_demo_account

logger = logging.getLogger(__name__)

DEMO_PASSWORD = "demo-password-123"  # noqa: S105 - development seed only

SEED_TENANTS = [
    {
        "slug": "app",
        "client_key": "proppredict",
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
            "drawdown_mode": "static",
            "profit_split_pct": 80,
            "max_stake_per_order": 2_500,
            "max_exposure_per_market": 5_000,
            "challenge_duration_days": 60,
            "min_trading_days": 10,
        },
    },
    {
        "slug": "apex",
        "client_key": "apex",
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
            "drawdown_mode": "trailing",
            "profit_split_pct": 90,
            "max_stake_per_order": 5_000,
            "max_exposure_per_market": 10_000,
            "challenge_duration_days": 45,
            "min_trading_days": 7,
        },
    },
    {
        "slug": "nova",
        "client_key": "nova",
        "name": "Nova Markets",
        "tagline": "Predict boldly. Trade funded.",
        "branding": {
            "accent": "#a78bfa",
            "accent_hover": "#8b5cf6",
            "accent_soft": "rgba(167, 139, 250, 0.12)",
            "accent_foreground": "#120a24",
            "logo_glyph": "N",
        },
        "features": {"leaderboard": True, "journal": False, "payouts": True},
        "program": {
            "currency": "USD",
            "account_sizes": [10_000, 50_000, 100_000],
            "profit_target_pct": 12,
            "max_daily_loss_pct": 5,
            "max_drawdown_pct": 12,
            "drawdown_mode": "static",
            "profit_split_pct": 75,
            "max_stake_per_order": 2_000,
            "max_exposure_per_market": 4_000,
            "challenge_duration_days": 90,
            "min_trading_days": 12,
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

        include_kalshi = tenant.slug == "apex"
        await ensure_tenant_account_catalog(db, tenant, include_kalshi=include_kalshi)

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
        await db.flush()

        trader_result = await db.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                User.email == f"trader@{tenant.slug}.proppredict.com",
            )
        )
        trader = trader_result.scalar_one()

        product = None
        if include_kalshi:
            from app.models import PropFirmAccount

            kalshi_product = await db.execute(
                select(PropFirmAccount).where(
                    PropFirmAccount.tenant_id == tenant.id,
                    PropFirmAccount.slug == "kalshi",
                )
            )
            product = kalshi_product.scalar_one_or_none()

        await provision_trader_demo_account(
            db,
            user=trader,
            tenant=tenant,
            prop_firm_account=product,
        )

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
