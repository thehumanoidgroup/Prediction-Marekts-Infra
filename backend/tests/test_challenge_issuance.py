"""Tests for challenge presets and admin issuance with custom rules."""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import IssuanceSource, MarketProvider, Tenant
from services.account_provisioning import preview_issuance_rules, provision_new_account
from services.challenge_presets import resolve_challenge_rules


@pytest.mark.asyncio
async def test_resolve_challenge_rules_scales_stake_caps() -> None:
    base = {
        "starting_balance": 25_000,
        "profit_target_pct": 10,
        "max_daily_loss_pct": 5,
        "max_drawdown_pct": 10,
        "max_stake_per_order": 2_500,
        "drawdown_mode": "static",
        "min_trading_days": 10,
        "challenge_duration_days": 60,
        "profit_split_pct": 80,
    }
    resolved = resolve_challenge_rules(
        base=base,
        model_type="2step",
        account_size=100_000,
        overrides={"max_stake_per_order": 2_500},
    )
    assert resolved["max_stake_per_order"] == 10_000
    assert resolved["profit_target_pct"] == 8.0


@pytest_asyncio.fixture
async def tenant(db_session: AsyncSession) -> Tenant:
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(
        slug=f"rules-{suffix}",
        client_key=f"rules-{suffix}",
        name="Rules Test Firm",
        tagline="Test",
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


@pytest.mark.asyncio
async def test_preview_issuance_rules_kalshi(db_session: AsyncSession, tenant: Tenant) -> None:
    preview = await preview_issuance_rules(
        db_session,
        tenant=tenant,
        provider=MarketProvider.KALSHI,
        account_size=50_000,
        model_type="2step",
        challenge_rules={"profit_target_pct": 9.0},
    )
    assert preview["account_size"] == 50_000
    assert preview["model_type"] == "2step"
    assert preview["profit_target_pct"] == 9.0
    assert preview["provider"] == "kalshi"


@pytest.mark.asyncio
async def test_provision_with_custom_model_and_rules(
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    from services.account_provisioning import ensure_tenant_account_catalog

    await ensure_tenant_account_catalog(db_session, tenant, include_kalshi=True)

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
            email="custom@example.com",
            provider="kalshi",
            account_size=100_000,
            model_type="3step",
            challenge_rules={"max_stake_per_order": 5_000},
            issuance_source=IssuanceSource.MANUAL,
        )
    await db_session.commit()

    assert result.account.model_type == "3step"
    assert result.account.starting_balance == 100_000
    assert result.applied_rules["model_type"] == "3step"
    assert result.applied_rules["account_size"] == 100_000
