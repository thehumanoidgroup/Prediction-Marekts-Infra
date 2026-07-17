"""Provisioning applies PropFirmChallengeTemplate across providers."""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import IssuanceSource, MarketProvider, Tenant, TraderDemoAccount
from services.account_provisioning import provision_new_account
from services.challenge_template_service import save_or_update_template


@pytest_asyncio.fixture
async def firm(db_session: AsyncSession) -> Tenant:
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(
        slug=f"tpl-iss-{suffix}",
        client_key=f"tpl-iss-{suffix}",
        name="Template Issuance Firm",
        tagline="Test",
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


async def _save_firm_1step(db: AsyncSession, tenant: Tenant):
    return await save_or_update_template(
        db,
        tenant.id,
        "1step",
        {
            "profit_target": 11.5,
            "daily_drawdown": 4.25,
            "max_drawdown": 8.75,
            "max_bet_size_per_pick": 1500.0,
            "max_bet_size_mode": "fixed",
            "min_trading_days": 9,
            "other_rules": {
                "drawdown_mode": "static",
                "profit_split_pct": 82.0,
                "challenge_duration_days": 45,
            },
        },
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "provider,issuance_source",
    [
        ("kalshi", IssuanceSource.MANUAL),
        ("kalshi", IssuanceSource.WEBHOOK),
        ("sp500_dynamic", IssuanceSource.MANUAL),
        ("sp500_dynamic", IssuanceSource.WEBHOOK),
        ("polymarket", IssuanceSource.MANUAL),
        ("polymarket", IssuanceSource.WEBHOOK),
        ("internal", IssuanceSource.MANUAL),
    ],
)
async def test_provision_applies_firm_template_all_providers(
    db_session: AsyncSession,
    firm: Tenant,
    provider: str,
    issuance_source: IssuanceSource,
) -> None:
    template = await _save_firm_1step(db_session, firm)

    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-TEST"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        result = await provision_new_account(
            db_session,
            tenant=firm,
            email=f"{provider}-{issuance_source.value}@example.com",
            provider=provider,
            account_size=50_000,
            model_type="1step",
            issuance_source=issuance_source,
            send_credentials_email=False,
        )

    account = (
        await db_session.execute(
            select(TraderDemoAccount)
            .where(TraderDemoAccount.id == result.account.id)
            .options(selectinload(TraderDemoAccount.challenge_config))
        )
    ).scalar_one()
    cfg = account.challenge_config

    assert account.provider.value == provider
    assert account.model_type == "1step"
    assert cfg.template_id == template.id
    assert cfg.provider.value == provider
    assert cfg.profit_target_pct == 11.5
    assert cfg.max_daily_loss_pct == 4.25
    assert cfg.max_drawdown_pct == 8.75
    assert cfg.max_stake_per_order == 1500.0
    assert cfg.min_trading_days == 9
    assert cfg.profit_split_pct == 82.0
    assert cfg.challenge_duration_days == 45
    assert result.applied_rules["profit_target_pct"] == 11.5
    assert result.sold_record.metadata_json
    assert result.sold_record.metadata_json.get("firm_template_id") == template.id

    if provider == "sp500_dynamic":
        assert cfg.sp500_tickers
        assert result.sp500_tickers
    if provider == "kalshi":
        assert result.kalshi_market_tickers == ["KXBTC-TEST"]


@pytest.mark.asyncio
async def test_provision_request_overrides_beat_firm_template(
    db_session: AsyncSession,
    firm: Tenant,
) -> None:
    await _save_firm_1step(db_session, firm)

    with patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        result = await provision_new_account(
            db_session,
            tenant=firm,
            email="override@example.com",
            provider="polymarket",
            account_size=25_000,
            model_type="1step",
            challenge_rules={
                "profit_target_pct": 7.0,
                "max_daily_loss_pct": 3.0,
                "max_stake_per_order": 900.0,
            },
            issuance_source=IssuanceSource.WEBHOOK,
            send_credentials_email=False,
        )

    cfg = (
        await db_session.execute(
            select(TraderDemoAccount)
            .where(TraderDemoAccount.id == result.account.id)
            .options(selectinload(TraderDemoAccount.challenge_config))
        )
    ).scalar_one().challenge_config

    # Request overrides win; remaining template fields still apply.
    assert cfg.profit_target_pct == 7.0
    assert cfg.max_daily_loss_pct == 3.0
    assert cfg.max_stake_per_order == 900.0
    assert cfg.max_drawdown_pct == 8.75
    assert cfg.min_trading_days == 9
    assert cfg.template_id is not None
    assert result.applied_rules["profit_target_pct"] == 7.0
