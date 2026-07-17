"""End-to-end: save templates → webhook/manual issuance → risk enforcement."""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.risk import OrderIntent, RiskEngine, RiskLimits
from app.models import IssuanceSource, Tenant, TraderDemoAccount
from services.account_provisioning import provision_new_account
from services.challenge_template_service import save_or_update_template


@pytest_asyncio.fixture
async def firm(db_session: AsyncSession) -> Tenant:
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(
        slug=f"e2e-tpl-{suffix}",
        client_key=f"e2e-tpl-{suffix}",
        name="E2E Template Firm",
        tagline="Test",
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


async def _save_distinct_templates(db: AsyncSession, tenant: Tenant) -> None:
    await save_or_update_template(
        db,
        tenant.id,
        "1step",
        {
            "profit_target": 12.0,
            "daily_drawdown": 4.0,
            "max_drawdown": 9.0,
            "max_bet_size_per_pick": 400.0,
            "max_bet_size_mode": "fixed",
            "min_trading_days": 8,
        },
    )
    await save_or_update_template(
        db,
        tenant.id,
        "2step",
        {
            "profit_target": 7.0,
            "daily_drawdown": 3.0,
            "max_drawdown": 6.5,
            "max_bet_size_per_pick": 250.0,
            "max_bet_size_mode": "fixed",
            "min_trading_days": 14,
            "consistency_score": 0.55,
        },
    )


@pytest.mark.asyncio
async def test_save_rejects_invalid_drawdown_order(db_session: AsyncSession, firm: Tenant) -> None:
    with pytest.raises(ValueError, match="Max drawdown must be greater"):
        await save_or_update_template(
            db_session,
            firm.id,
            "1step",
            {
                "profit_target": 10,
                "daily_drawdown": 8,
                "max_drawdown": 5,
                "max_bet_size_per_pick": 2,
                "max_bet_size_mode": "percent",
            },
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["kalshi", "sp500_dynamic", "polymarket", "internal"])
async def test_webhook_uses_model_template(
    db_session: AsyncSession,
    firm: Tenant,
    provider: str,
) -> None:
    await _save_distinct_templates(db_session, firm)

    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-E2E"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        one = await provision_new_account(
            db_session,
            tenant=firm,
            email=f"one-{provider}@example.com",
            provider=provider,
            account_size=25_000,
            model_type="1step",
            issuance_source=IssuanceSource.WEBHOOK,
            send_credentials_email=False,
        )
        two = await provision_new_account(
            db_session,
            tenant=firm,
            email=f"two-{provider}@example.com",
            provider=provider,
            account_size=25_000,
            model_type="2step",
            issuance_source=IssuanceSource.WEBHOOK,
            send_credentials_email=False,
            replace_existing=True,
        )

    one_cfg = (
        await db_session.execute(
            select(TraderDemoAccount)
            .where(TraderDemoAccount.id == one.account.id)
            .options(selectinload(TraderDemoAccount.challenge_config))
        )
    ).scalar_one().challenge_config
    two_cfg = (
        await db_session.execute(
            select(TraderDemoAccount)
            .where(TraderDemoAccount.id == two.account.id)
            .options(selectinload(TraderDemoAccount.challenge_config))
        )
    ).scalar_one().challenge_config

    assert one_cfg.profit_target_pct == 12.0
    assert one_cfg.max_daily_loss_pct == 4.0
    assert one_cfg.max_drawdown_pct == 9.0
    assert one_cfg.max_stake_per_order == 400.0
    assert one_cfg.template_id is not None

    assert two_cfg.profit_target_pct == 7.0
    assert two_cfg.max_daily_loss_pct == 3.0
    assert two_cfg.max_drawdown_pct == 6.5
    assert two_cfg.max_stake_per_order == 250.0
    assert two_cfg.min_consistency_score == 0.55
    assert two_cfg.provider.value == provider


@pytest.mark.asyncio
async def test_manual_issuance_allows_override(db_session: AsyncSession, firm: Tenant) -> None:
    await _save_distinct_templates(db_session, firm)

    with patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        result = await provision_new_account(
            db_session,
            tenant=firm,
            email="override@example.com",
            provider="sp500_dynamic",
            account_size=50_000,
            model_type="2step",
            challenge_rules={
                "profit_target_pct": 5.5,
                "max_stake_per_order": 175.0,
            },
            issuance_source=IssuanceSource.MANUAL,
            send_credentials_email=False,
        )

    cfg = (
        await db_session.execute(
            select(TraderDemoAccount)
            .where(TraderDemoAccount.id == result.account.id)
            .options(selectinload(TraderDemoAccount.challenge_config))
        )
    ).scalar_one().challenge_config

    assert cfg.profit_target_pct == 5.5
    assert cfg.max_stake_per_order == 175.0
    # Non-overridden template fields remain.
    assert cfg.max_daily_loss_pct == 3.0
    assert cfg.max_drawdown_pct == 6.5
    assert cfg.template_id is not None
    assert result.applied_rules["profit_target_pct"] == 5.5


@pytest.mark.asyncio
async def test_risk_engine_enforces_template_stake_limits(
    db_session: AsyncSession,
    firm: Tenant,
) -> None:
    await _save_distinct_templates(db_session, firm)

    with patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        result = await provision_new_account(
            db_session,
            tenant=firm,
            email="risk@example.com",
            provider="sp500_dynamic",
            account_size=25_000,
            model_type="1step",
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

    engine = RiskEngine(
        RiskLimits(
            starting_balance=25_000,
            profit_target_pct=cfg.profit_target_pct,
            max_daily_loss_pct=cfg.max_daily_loss_pct,
            max_drawdown_pct=cfg.max_drawdown_pct,
            max_stake_per_order=cfg.max_stake_per_order,
            max_exposure_per_market=cfg.max_exposure_per_market or 2_000,
        )
    )

    blocked = engine.check_order(OrderIntent(market_id="sp500-AAPL", stake=500))
    assert blocked.allowed is False
    assert blocked.violations

    allowed = engine.check_order(OrderIntent(market_id="sp500-AAPL", stake=200))
    assert allowed.allowed is True
