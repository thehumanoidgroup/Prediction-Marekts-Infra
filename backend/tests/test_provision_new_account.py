"""Tests for provision_new_account and sold-account logging."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IssuanceSource, MarketProvider, Tenant, User, UserRole
from services.account_provisioning import (
    ensure_tenant_account_catalog,
    fetch_kalshi_live_markets,
    list_sold_accounts,
    provision_new_account,
)


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession) -> Tenant:
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(
        slug=f"prov-{suffix}",
        client_key=f"prov-{suffix}",
        name="Provision Test Firm",
        tagline="Test",
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


@pytest.mark.asyncio
async def test_fetch_kalshi_live_markets_uses_api_tickers() -> None:
    markets = [
        {"ticker": "KXBTC-25", "title": "Bitcoin price", "status": "open", "volume_24h_fp": 1000},
        {"ticker": "KXFED-25", "title": "Fed rate cut", "status": "open", "volume_24h_fp": 500},
    ]

    async def fake_iter(*_args, **_kwargs):
        for m in markets:
            yield m

    mock_client = AsyncMock()
    mock_client.iter_markets = fake_iter
    mock_client.aclose = AsyncMock()

    with patch(
        "services.account_provisioning.KalshiClient.from_settings",
        return_value=mock_client,
    ):
        tickers = await fetch_kalshi_live_markets(categories=["crypto", "economics"], max_total=5)

    assert "KXBTC-25" in tickers
    assert "KXFED-25" in tickers


@pytest.mark.asyncio
async def test_provision_new_account_kalshi_new_trader(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    await ensure_tenant_account_catalog(db_session, tenant, include_kalshi=True)

    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-25", "KXFED-25"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        result = await provision_new_account(
            db_session,
            tenant=tenant,
            email="newtrader@example.com",
            provider="kalshi",
            account_size=10_000,
            issuance_source=IssuanceSource.MANUAL,
        )
    await db_session.commit()

    assert result.created_user is True
    assert result.temporary_password is not None
    assert result.account.provider is MarketProvider.KALSHI
    assert result.account.starting_balance == 10_000
    assert result.account.virtual_balance == 10_000
    assert result.kalshi_market_tickers == ["KXBTC-25", "KXFED-25"]
    assert result.sold_record.provider is MarketProvider.KALSHI
    assert result.sold_record.issuance_source is IssuanceSource.MANUAL
    assert result.email_sent is True

    program = result.account.to_program_dict()
    assert program["provider"] == "kalshi"
    assert program["model_type"] == "1step"


@pytest.mark.asyncio
async def test_provision_new_account_kalshi_existing_trader(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    from app.core.security import hash_password

    await ensure_tenant_account_catalog(db_session, tenant, include_kalshi=True)
    user = User(
        tenant_id=tenant.id,
        email="existing@example.com",
        display_name="Existing",
        hashed_password=hash_password("secret"),
        role=UserRole.TRADER,
    )
    db_session.add(user)
    await db_session.flush()

    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-25"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        result = await provision_new_account(
            db_session,
            tenant=tenant,
            email="existing@example.com",
            provider="kalshi",
            account_size=25_000,
            issuance_source=IssuanceSource.WEBHOOK,
            external_order_id="order-123",
        )
    await db_session.commit()

    assert result.created_user is False
    assert result.temporary_password is None
    assert result.account.user_id == user.id
    assert result.sold_record.external_order_id == "order-123"
    assert result.sold_record.issuance_source is IssuanceSource.WEBHOOK


@pytest.mark.asyncio
async def test_list_sold_accounts_filters_by_tenant(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    await ensure_tenant_account_catalog(db_session, tenant, include_kalshi=True)

    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-25"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=False,
    ):
        await provision_new_account(
            db_session,
            tenant=tenant,
            email="sold@example.com",
            provider="kalshi",
            account_size=25_000,
            issuance_source=IssuanceSource.MANUAL,
        )
    await db_session.commit()

    records = await list_sold_accounts(db_session, tenant_id=tenant.id)
    assert len(records) == 1
    assert records[0].trader_email == "sold@example.com"
    assert records[0].provider is MarketProvider.KALSHI

    all_records = await list_sold_accounts(db_session)
    assert len(all_records) >= 1


@pytest.mark.asyncio
async def test_scaled_stake_limits_in_program_dict(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    await ensure_tenant_account_catalog(db_session, tenant, include_kalshi=True)

    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-25"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=False,
    ):
        result = await provision_new_account(
            db_session,
            tenant=tenant,
            email="scaled@example.com",
            provider="kalshi",
            account_size=50_000,
            issuance_source=IssuanceSource.MANUAL,
        )
    await db_session.commit()

    program = result.account.to_program_dict()
    cfg = result.account.challenge_config
    base = float(cfg.starting_balance)
    ratio = 50_000 / base
    if cfg.max_stake_per_order:
        assert program["max_stake_per_order"] == round(cfg.max_stake_per_order * ratio, 2)
