"""Tests for scripts/seed_test_traders.py."""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PropFirmChallengeTemplate, Tenant, TraderDemoAccount, User
from app.runtime.store import get_trading_store
from scripts.seed_test_traders import (
    MODEL_TYPES,
    build_trader_plans,
    seed_firm,
)


@pytest_asyncio.fixture
async def firm(db_session: AsyncSession) -> Tenant:
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(
        slug=f"seed-firm-{suffix}",
        client_key=f"seed-firm-{suffix}",
        name="Seed Firm",
        tagline="Test",
        program={
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
    )
    db_session.add(tenant)
    await db_session.flush()
    return tenant


def test_build_trader_plans_distributes_model_types():
    tenant = Tenant(slug="demo", client_key="demo", name="Demo")
    plans = build_trader_plans(tenant, 4)
    assert len(plans) == 4
    assert [p.model_type for p in plans] == list(MODEL_TYPES)
    assert len({p.email for p in plans}) == 4
    assert all(p.account_size in {10_000, 25_000, 50_000, 100_000} for p in plans)


def test_build_trader_plans_clamps_to_3_5():
    tenant = Tenant(slug="demo", client_key="demo", name="Demo")
    assert len(build_trader_plans(tenant, 2)) == 3
    assert len(build_trader_plans(tenant, 9)) == 5
    plans5 = build_trader_plans(tenant, 5)
    assert [p.model_type for p in plans5] == [
        "1step",
        "2step",
        "3step",
        "instant",
        "1step",
    ]


@pytest.mark.asyncio
async def test_seed_firm_is_idempotent(db_session: AsyncSession, firm: Tenant):
    first = await seed_firm(
        db_session,
        firm,
        traders_per_firm=4,
        replace_existing=False,
        with_positions=True,
    )
    assert len(first["traders"]) == 4
    assert {t["model_type"] for t in first["traders"]} == set(MODEL_TYPES)
    assert all(t["positions_placed"] >= 1 for t in first["traders"])
    assert all(t["virtual_balance"] > 0 for t in first["traders"])

    templates = (
        await db_session.execute(
            select(PropFirmChallengeTemplate).where(
                PropFirmChallengeTemplate.prop_firm_id == firm.id
            )
        )
    ).scalars().all()
    assert {t.model_type for t in templates} == set(MODEL_TYPES)

    users = (
        await db_session.execute(select(User).where(User.tenant_id == firm.id))
    ).scalars().all()
    assert len(users) == 4

    accounts = (
        await db_session.execute(
            select(TraderDemoAccount).where(TraderDemoAccount.tenant_id == firm.id)
        )
    ).scalars().all()
    assert len(accounts) == 4
    assert all(account.challenge_config_id for account in accounts)

    # Sample positions live on the in-memory trading store for each user.
    store = get_trading_store()
    positioned = 0
    for row in first["traders"]:
        key = (firm.slug, str(row["user_id"]))
        sessions = [s for s in store.iter_sessions() if (s.tenant_slug, s.user_id) == key]
        if sessions and sessions[0].bankroll.positions():
            positioned += 1
    assert positioned == 4

    second = await seed_firm(
        db_session,
        firm,
        traders_per_firm=4,
        replace_existing=False,
        with_positions=True,
    )
    assert len(second["traders"]) == 4
    assert all(row["created_user"] is False for row in second["traders"])
    assert all(row.get("skipped_provision") is True for row in second["traders"])
    # Idempotent: do not double-place positions when already open.
    assert all(row["positions_placed"] == 0 for row in second["traders"])

    users_after = (
        await db_session.execute(select(User).where(User.tenant_id == firm.id))
    ).scalars().all()
    assert len(users_after) == 4
