"""Unit tests for PropFirmChallengeTemplate model + uniqueness."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import (
    ChallengeConfig,
    MarketProvider,
    MaxBetSizeMode,
    PropFirmChallengeTemplate,
    PropFirmModelTypeChoice,
    Tenant,
)


@pytest.mark.asyncio
async def test_prop_firm_challenge_template_unique_per_model(db_session) -> None:
    tenant = (
        await db_session.execute(select(Tenant).where(Tenant.slug == "apex"))
    ).scalar_one()

    first = PropFirmChallengeTemplate(
        prop_firm_id=tenant.id,
        model_type=PropFirmModelTypeChoice.ONE_STEP.value,
        profit_target=10.0,
        daily_drawdown=5.0,
        max_drawdown=10.0,
        max_bet_size_per_pick=2.0,
        max_bet_size_mode=MaxBetSizeMode.PERCENT.value,
        consistency_score=0.4,
        min_trading_days=10,
        other_rules={"news_blackout": True},
    )
    db_session.add(first)
    await db_session.flush()

    mapped = first.to_challenge_fields()
    assert mapped["profit_target_pct"] == 10.0
    assert mapped["max_daily_loss_pct"] == 5.0
    assert mapped["model_type"] == "1step"
    assert mapped["other_rules"]["news_blackout"] is True

    # Link a ChallengeConfig to the template for override tracking.
    config = ChallengeConfig(
        tenant_id=tenant.id,
        name="Apex 1-Step from template",
        provider=MarketProvider.INTERNAL,
        starting_balance=25_000,
        profit_target_pct=10.0,
        max_daily_loss_pct=5.0,
        max_drawdown_pct=10.0,
        model_type="1step",
        template_id=first.id,
    )
    db_session.add(config)
    await db_session.flush()
    assert config.template_id == first.id

    duplicate = PropFirmChallengeTemplate(
        prop_firm_id=tenant.id,
        model_type="1step",
        profit_target=8.0,
        daily_drawdown=4.0,
        max_drawdown=8.0,
        max_bet_size_per_pick=1.5,
        max_bet_size_mode=MaxBetSizeMode.PERCENT.value,
        other_rules={},
    )
    db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # Re-load tenant after rollback for the second insert.
    tenant = (
        await db_session.execute(select(Tenant).where(Tenant.slug == "apex"))
    ).scalar_one()

    # Different model type is allowed for the same firm.
    second = PropFirmChallengeTemplate(
        prop_firm_id=tenant.id,
        model_type=PropFirmModelTypeChoice.TWO_STEP.value,
        profit_target=8.0,
        daily_drawdown=4.0,
        max_drawdown=8.0,
        max_bet_size_per_pick=1500.0,
        max_bet_size_mode=MaxBetSizeMode.FIXED.value,
        max_bet_size_rules={"mode": "fixed", "value": 1500},
        other_rules={},
    )
    db_session.add(second)
    await db_session.flush()
    assert second.model_type == "2step"
