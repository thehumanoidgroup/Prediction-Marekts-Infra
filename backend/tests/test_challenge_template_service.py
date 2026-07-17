"""Unit tests for challenge_template_service."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import (
    MarketProvider,
    MaxBetSizeMode,
    PropFirmAccount,
    PropFirmChallengeTemplate,
    Tenant,
)
from services.challenge_template_service import (
    apply_template_to_account,
    get_all_templates_for_prop_firm,
    get_template_for_model,
    is_persisted_template,
    save_or_update_template,
    template_to_dict,
)


@pytest.mark.asyncio
async def test_get_template_for_model_returns_defaults(db_session) -> None:
    tenant = (
        await db_session.execute(select(Tenant).where(Tenant.slug == "apex"))
    ).scalar_one()

    template = await get_template_for_model(db_session, tenant.id, "1step")
    assert not is_persisted_template(template)
    assert template.model_type == "1step"
    assert template.profit_target == 10.0
    assert template.daily_drawdown == 5.0
    assert template.max_drawdown == 10.0
    assert template_to_dict(template)["is_default"] is True


@pytest.mark.asyncio
async def test_save_or_update_and_get_template(db_session) -> None:
    tenant = (
        await db_session.execute(select(Tenant).where(Tenant.slug == "apex"))
    ).scalar_one()

    saved = await save_or_update_template(
        db_session,
        tenant.id,
        "2-step",
        {
            "profit_target_pct": 9.5,
            "max_daily_loss_pct": 3.5,
            "max_drawdown_pct": 7.0,
            "max_stake_per_order": 1200.0,
            "min_consistency_score": 0.5,
            "min_trading_days": 12,
            "drawdown_mode": "trailing",
            "profit_split_pct": 88.0,
        },
    )
    assert is_persisted_template(saved)
    assert saved.model_type == "2step"
    assert saved.profit_target == 9.5
    assert saved.daily_drawdown == 3.5
    assert saved.max_drawdown == 7.0
    assert saved.max_bet_size_mode == MaxBetSizeMode.FIXED.value
    assert saved.max_bet_size_per_pick == 1200.0
    assert saved.other_rules["drawdown_mode"] == "trailing"
    assert saved.other_rules["profit_split_pct"] == 88.0

    loaded = await get_template_for_model(db_session, tenant.id, "2step")
    assert loaded.id == saved.id
    assert loaded.profit_target == 9.5

    updated = await save_or_update_template(
        db_session,
        tenant.id,
        "2step",
        {"profit_target": 8.0, "daily_drawdown": 4.0},
    )
    assert updated.id == saved.id
    assert updated.profit_target == 8.0
    assert updated.daily_drawdown == 4.0
    # Unspecified fields retained.
    assert updated.max_drawdown == 7.0


@pytest.mark.asyncio
async def test_get_all_templates_for_prop_firm_fills_defaults(db_session) -> None:
    tenant = (
        await db_session.execute(select(Tenant).where(Tenant.slug == "apex"))
    ).scalar_one()

    await save_or_update_template(
        db_session,
        tenant.id,
        "instant",
        {
            "profit_target": 15.0,
            "daily_drawdown": 6.0,
            "max_drawdown": 12.0,
            "max_bet_size_per_pick": 3.0,
            "max_bet_size_mode": "percent",
        },
    )

    all_templates = await get_all_templates_for_prop_firm(db_session, tenant.id)
    assert len(all_templates) == 4
    by_type = {t.model_type: t for t in all_templates}
    assert is_persisted_template(by_type["instant"])
    assert by_type["instant"].profit_target == 15.0
    assert not is_persisted_template(by_type["1step"])
    assert not is_persisted_template(by_type["2step"])
    assert not is_persisted_template(by_type["3step"])

    saved_only = await get_all_templates_for_prop_firm(
        db_session, tenant.id, include_defaults=False
    )
    assert len(saved_only) == 1
    assert saved_only[0].model_type == "instant"


@pytest.mark.asyncio
async def test_apply_template_to_account(db_session) -> None:
    tenant = (
        await db_session.execute(select(Tenant).where(Tenant.slug == "apex"))
    ).scalar_one()

    product = (
        await db_session.execute(
            select(PropFirmAccount)
            .where(PropFirmAccount.tenant_id == tenant.id, PropFirmAccount.is_default.is_(True))
            .options(selectinload(PropFirmAccount.challenge_config))
        )
    ).scalar_one()

    template = await save_or_update_template(
        db_session,
        tenant.id,
        "3step",
        {
            "profit_target": 6.5,
            "daily_drawdown": 2.5,
            "max_drawdown": 5.5,
            "max_bet_size_per_pick": 800.0,
            "max_bet_size_mode": "fixed",
            "consistency_score": 0.62,
            "min_trading_days": 21,
            "other_rules": {
                "drawdown_mode": "trailing",
                "profit_split_pct": 90.0,
                "challenge_duration_days": 100,
            },
        },
    )

    config = await apply_template_to_account(db_session, product, template)
    assert config.template_id == template.id
    assert config.profit_target_pct == 6.5
    assert config.max_daily_loss_pct == 2.5
    assert config.max_drawdown_pct == 5.5
    assert config.max_stake_per_order == 800.0
    assert config.min_consistency_score == 0.62
    assert config.min_trading_days == 21
    assert config.model_type == "3step"
    assert config.drawdown_mode == "trailing"
    assert config.profit_split_pct == 90.0
    assert config.challenge_duration_days == 100

    # Applying defaults clears template_id.
    defaults = await get_template_for_model(db_session, tenant.id, "1step")
    config = await apply_template_to_account(db_session, product, defaults)
    assert config.template_id is None
    assert config.profit_target_pct == 10.0
    assert config.model_type == "1step"


@pytest.mark.asyncio
async def test_issuance_links_persisted_firm_template(db_session) -> None:
    from services.account_provisioning import preview_issuance_rules

    tenant = (
        await db_session.execute(select(Tenant).where(Tenant.slug == "apex"))
    ).scalar_one()

    await save_or_update_template(
        db_session,
        tenant.id,
        "1step",
        {
            "profit_target": 11.0,
            "daily_drawdown": 4.5,
            "max_drawdown": 9.0,
            "max_bet_size_per_pick": 2.5,
            "max_bet_size_mode": "percent",
            "min_trading_days": 8,
        },
    )

    preview = await preview_issuance_rules(
        db_session,
        tenant=tenant,
        provider=MarketProvider.INTERNAL,
        account_size=25_000,
        model_type="1step",
    )
    assert preview["profit_target_pct"] == 11.0
    assert preview["max_daily_loss_pct"] == 4.5
    assert preview["max_drawdown_pct"] == 9.0
    assert preview["min_trading_days"] == 8

    # Ensure template row still unique and queryable.
    count = (
        await db_session.execute(
            select(PropFirmChallengeTemplate).where(
                PropFirmChallengeTemplate.prop_firm_id == tenant.id,
                PropFirmChallengeTemplate.model_type == "1step",
            )
        )
    ).scalars().all()
    assert len(count) == 1
