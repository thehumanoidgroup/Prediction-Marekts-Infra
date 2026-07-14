"""Tests for multi-provider account provisioning."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models import (
    ChallengeConfig,
    MarketProvider,
    PropFirmAccount,
    Tenant,
    TraderDemoAccount,
    User,
    UserRole,
)
from services.account_provisioning import (
    ensure_tenant_account_catalog,
    get_or_provision_trader_demo_account,
    provision_trader_demo_account,
)


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession) -> Tenant:
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(
        slug=f"testfirm-{suffix}",
        client_key=f"testfirm-{suffix}",
        name="Test Firm",
        tagline="Test",
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


@pytest_asyncio.fixture
async def trader(db_session: AsyncSession, tenant: Tenant) -> User:
    user = User(
        tenant_id=tenant.id,
        email="trader@testfirm.proppredict.com",
        display_name="Trader",
        hashed_password=hash_password("password"),
        role=UserRole.TRADER,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_ensure_tenant_account_catalog_creates_internal_default(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    product = await ensure_tenant_account_catalog(db_session, tenant)
    await db_session.commit()
    await db_session.refresh(product, attribute_names=["challenge_config"])

    assert product.is_default is True
    assert product.provider is MarketProvider.INTERNAL
    assert product.challenge_config.provider is MarketProvider.INTERNAL


@pytest.mark.asyncio
async def test_ensure_tenant_account_catalog_includes_kalshi_product(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    await ensure_tenant_account_catalog(db_session, tenant, include_kalshi=True)
    await db_session.commit()

    result = await db_session.execute(
        select(PropFirmAccount)
        .where(PropFirmAccount.tenant_id == tenant.id)
        .options(selectinload(PropFirmAccount.challenge_config))
    )
    products = result.scalars().all()
    slugs = {p.slug for p in products}
    assert slugs == {"standard", "kalshi"}

    kalshi = next(p for p in products if p.slug == "kalshi")
    assert kalshi.provider is MarketProvider.KALSHI
    assert kalshi.challenge_config.kalshi_market_tickers


@pytest.mark.asyncio
async def test_provision_trader_demo_account_defaults_internal(
    db_session: AsyncSession,
    tenant: Tenant,
    trader: User,
) -> None:
    await ensure_tenant_account_catalog(db_session, tenant)
    account = await provision_trader_demo_account(db_session, user=trader, tenant=tenant)
    await db_session.commit()

    assert account.provider is MarketProvider.INTERNAL
    assert account.starting_balance > 0
    program = account.to_program_dict()
    assert program["provider"] == "internal"


@pytest.mark.asyncio
async def test_provision_trader_demo_account_kalshi_product(
    db_session: AsyncSession,
    tenant: Tenant,
    trader: User,
) -> None:
    await ensure_tenant_account_catalog(db_session, tenant, include_kalshi=True)
    result = await db_session.execute(
        select(PropFirmAccount).where(
            PropFirmAccount.tenant_id == tenant.id,
            PropFirmAccount.slug == "kalshi",
        )
    )
    kalshi_product = result.scalar_one()

    account = await provision_trader_demo_account(
        db_session,
        user=trader,
        tenant=tenant,
        prop_firm_account=kalshi_product,
    )
    await db_session.commit()

    assert account.provider is MarketProvider.KALSHI
    assert account.kalshi_market_tickers
    assert account.effective_kalshi_tickers()


@pytest.mark.asyncio
async def test_get_or_provision_is_idempotent(
    db_session: AsyncSession,
    tenant: Tenant,
    trader: User,
) -> None:
    await ensure_tenant_account_catalog(db_session, tenant)
    first = await get_or_provision_trader_demo_account(db_session, user=trader, tenant=tenant)
    second = await get_or_provision_trader_demo_account(db_session, user=trader, tenant=tenant)
    await db_session.commit()

    assert first.id == second.id

    count = await db_session.execute(
        select(TraderDemoAccount).where(TraderDemoAccount.user_id == trader.id)
    )
    assert len(count.scalars().all()) == 1


@pytest.mark.asyncio
async def test_challenge_config_stores_provider_rules(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    config = ChallengeConfig(
        tenant_id=tenant.id,
        name="Kalshi Pro",
        provider=MarketProvider.KALSHI,
        starting_balance=50_000,
        kalshi_market_tickers=["KXBTC-25", "KXFED-25"],
        polymarket_condition_ids=["0xabc"],
    )
    db_session.add(config)
    await db_session.commit()

    loaded = await db_session.get(ChallengeConfig, config.id)
    assert loaded is not None
    assert loaded.provider is MarketProvider.KALSHI
    assert loaded.kalshi_market_tickers == ["KXBTC-25", "KXFED-25"]
