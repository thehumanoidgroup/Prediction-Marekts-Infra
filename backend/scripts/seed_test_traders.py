#!/usr/bin/env python3
"""Seed test traders for every prop firm (idempotent).

For each existing ``Tenant`` (prop firm):

1. Ensure the account catalog + per-model challenge templates exist
2. Create 3–5 test traders with model types distributed evenly
   (``1step``, ``2step``, ``3step``, ``instant``)
3. Provision each via :func:`provision_new_account` (applies firm templates)
4. Optionally place sample positions (LMSR + provider-tagged virtual fills)
   so each trader's Portfolio has open bets across internal / Kalshi /
   Polymarket / S&P 500 filters

Run from the ``backend/`` directory::

    PYTHONPATH=. python scripts/seed_test_traders.py
    PYTHONPATH=. python scripts/seed_test_traders.py --traders-per-firm 5 --with-positions
    PYTHONPATH=. python scripts/seed_test_traders.py --tenant-slug apex --no-positions

Safe to re-run: traders are keyed by ``(tenant_id, email)`` / demo account
``(tenant_id, user_id)``; existing accounts are left as-is unless ``--replace``.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Allow ``python scripts/seed_test_traders.py`` from backend/ or repo root.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import SessionLocal, engine
from app.models import IssuanceSource, MarketProvider, Tenant, TraderDemoAccount, User
from app.models.account import PropFirmModelTypeChoice
from app.runtime.catalog import MARKET_SEEDS
from app.runtime.store import get_trading_store
from services.account_provisioning import (
    ensure_tenant_account_catalog,
    provision_new_account,
)
from services.challenge_template_service import (
    default_template_fields,
    save_or_update_template,
)

logger = logging.getLogger("seed_test_traders")

MODEL_TYPES: tuple[str, ...] = (
    PropFirmModelTypeChoice.ONE_STEP.value,
    PropFirmModelTypeChoice.TWO_STEP.value,
    PropFirmModelTypeChoice.THREE_STEP.value,
    PropFirmModelTypeChoice.INSTANT.value,
)

# Common evaluation sizes used across prop firms.
ACCOUNT_SIZES: tuple[int, ...] = (10_000, 25_000, 50_000, 100_000)

# Stable email namespace so re-runs hit the same users.
EMAIL_DOMAIN_SUFFIX = "seed.proppredict.com"

DEFAULT_TRADERS_PER_FIRM = 4
SAMPLE_POSITION_SPECS: tuple[tuple[str, str, int], ...] = (
    ("mkt-1", "yes", 40),
    ("mkt-4", "no", 25),
    ("mkt-11", "yes", 30),
)

# Synthetic external fills so Portfolio filters work per provider.
EXTERNAL_SAMPLE_SPECS: dict[str, tuple[tuple[str, str, str, int, float], ...]] = {
    MarketProvider.KALSHI.value: (
        ("kalshi-SEEDKXBTCD", "Will BTC settle above strike this week?", "yes", 35, 0.48),
        ("kalshi-SEEDFEDRATE", "Will the Fed cut rates this meeting?", "no", 20, 0.41),
    ),
    MarketProvider.POLYMARKET.value: (
        ("poly-seed-election-2026", "Will the incumbent party hold Congress?", "yes", 30, 0.52),
        ("poly-seed-ai-release", "Will a major AI model ship before Q4?", "no", 25, 0.37),
    ),
    MarketProvider.SP500_DYNAMIC.value: (
        ("sp500-AAPL-seed-0dte", "Will AAPL finish above strike today?", "yes", 40, 0.55),
        ("sp500-NVDA-seed-weekly", "Will NVDA finish above strike this week?", "no", 22, 0.44),
    ),
}


@dataclass(frozen=True)
class TraderSeedPlan:
    index: int
    model_type: str
    account_size: int
    email: str
    display_name: str
    provider: str


_PROVIDER_ROTATION: tuple[str, ...] = (
    MarketProvider.INTERNAL.value,
    MarketProvider.KALSHI.value,
    MarketProvider.POLYMARKET.value,
    MarketProvider.SP500_DYNAMIC.value,
)


def _provider_for_tenant(tenant: Tenant, index: int) -> str:
    """Rotate providers so each firm gets coverage across all market sources."""
    # Keep apex biased toward Kalshi for live-integration demos.
    if tenant.slug == "apex" and index % 2 == 1:
        return MarketProvider.KALSHI.value
    return _PROVIDER_ROTATION[index % len(_PROVIDER_ROTATION)]


def build_trader_plans(tenant: Tenant, traders_per_firm: int) -> list[TraderSeedPlan]:
    count = max(3, min(5, int(traders_per_firm)))
    plans: list[TraderSeedPlan] = []
    for i in range(count):
        model_type = MODEL_TYPES[i % len(MODEL_TYPES)]
        account_size = ACCOUNT_SIZES[i % len(ACCOUNT_SIZES)]
        email = f"test-trader-{i + 1}-{model_type}@{tenant.slug}.{EMAIL_DOMAIN_SUFFIX}"
        plans.append(
            TraderSeedPlan(
                index=i + 1,
                model_type=model_type,
                account_size=account_size,
                email=email,
                display_name=f"Test Trader {i + 1} ({model_type})",
                provider=_provider_for_tenant(tenant, i),
            )
        )
    return plans


async def ensure_firm_templates(db: AsyncSession, tenant: Tenant) -> int:
    """Persist default PropFirmChallengeTemplate rows for every model type."""
    created_or_updated = 0
    for model_type in MODEL_TYPES:
        defaults = default_template_fields(model_type)
        await save_or_update_template(db, tenant.id, model_type, defaults)
        created_or_updated += 1
    await db.flush()
    return created_or_updated


async def seed_sample_positions(
    *,
    tenant: Tenant,
    user: User,
    account: TraderDemoAccount,
) -> int:
    """Place sample buys so each trader's Portfolio has open positions.

    Internal accounts get LMSR catalog fills. Kalshi / Polymarket / S&P 500
    accounts get virtual external fills tagged with the correct provider so
    Portfolio filters and live marks work end-to-end.
    """
    store = get_trading_store()
    session = store.get_session(
        tenant.slug,
        str(user.id),
        account.to_program_dict(),
        provider=account.provider.value,
        kalshi_market_tickers=account.effective_kalshi_tickers(),
        sp500_tickers=account.effective_sp500_tickers(),
        demo_account_id=account.id,
    )
    if session.bankroll.positions():
        return 0

    placed = 0
    provider = account.provider.value

    if provider == MarketProvider.INTERNAL.value:
        available_ids = {seed.id for seed in MARKET_SEEDS}
        for market_id, outcome, shares in SAMPLE_POSITION_SPECS:
            if market_id not in available_ids:
                continue
            if store.get_market(market_id) is None:
                continue
            try:
                store.place_order(
                    session,
                    market_id=market_id,
                    outcome=outcome,
                    side="buy",
                    shares=shares,
                )
                placed += 1
            except ValueError as exc:
                logger.warning(
                    "Skip sample position %s for %s: %s",
                    market_id,
                    user.email,
                    exc,
                )
        return placed

    specs = EXTERNAL_SAMPLE_SPECS.get(provider, ())
    for market_id, question, outcome, shares, yes_price in specs:
        try:
            store.place_external_order(
                session,
                market_id=market_id,
                market_question=question,
                outcome=outcome,
                side="buy",
                shares=shares,
                yes_price=yes_price,
                category="stocks" if provider == MarketProvider.SP500_DYNAMIC.value else "economics",
            )
            placed += 1
        except ValueError as exc:
            logger.warning(
                "Skip external sample %s for %s: %s",
                market_id,
                user.email,
                exc,
            )

    # Always include one internal LMSR fill so "All" and internal filters
    # still show data even on external-provider accounts.
    if store.get_market("mkt-1") is not None:
        try:
            store.place_order(
                session,
                market_id="mkt-1",
                outcome="yes",
                side="buy",
                shares=15,
            )
            placed += 1
        except ValueError:
            pass

    return placed


async def _find_existing_seed_account(
    db: AsyncSession,
    *,
    tenant: Tenant,
    email: str,
) -> tuple[User, TraderDemoAccount] | None:
    user_result = await db.execute(
        select(User).where(User.tenant_id == tenant.id, User.email == email)
    )
    user = user_result.scalar_one_or_none()
    if user is None:
        return None
    account_result = await db.execute(
        select(TraderDemoAccount)
        .where(
            TraderDemoAccount.tenant_id == tenant.id,
            TraderDemoAccount.user_id == user.id,
        )
        .options(
            selectinload(TraderDemoAccount.challenge_config),
            selectinload(TraderDemoAccount.prop_firm_account),
        )
    )
    account = account_result.scalar_one_or_none()
    if account is None:
        return None
    return user, account


async def seed_trader(
    db: AsyncSession,
    *,
    tenant: Tenant,
    plan: TraderSeedPlan,
    replace_existing: bool,
    with_positions: bool,
) -> dict[str, Any]:
    existing = await _find_existing_seed_account(db, tenant=tenant, email=plan.email)
    if existing is not None and not replace_existing:
        user, account = existing
        positions_placed = 0
        if with_positions:
            positions_placed = await seed_sample_positions(
                tenant=tenant,
                user=user,
                account=account,
            )
        return {
            "email": user.email,
            "user_id": user.id,
            "account_id": account.id,
            "model_type": account.model_type,
            "provider": account.provider.value,
            "virtual_balance": float(account.virtual_balance),
            "created_user": False,
            "positions_placed": positions_placed,
            "applied_model_type": account.model_type,
            "skipped_provision": True,
        }

    result = await provision_new_account(
        db,
        tenant=tenant,
        email=plan.email,
        display_name=plan.display_name,
        provider=plan.provider,
        account_size=plan.account_size,
        model_type=plan.model_type,
        issuance_source=IssuanceSource.MANUAL,
        replace_existing=replace_existing,
        send_credentials_email=False,
        metadata={
            "seed": "seed_test_traders",
            "seed_index": plan.index,
            "seed_model_type": plan.model_type,
        },
    )

    positions_placed = 0
    if with_positions:
        positions_placed = await seed_sample_positions(
            tenant=tenant,
            user=result.user,
            account=result.account,
        )

    return {
        "email": result.user.email,
        "user_id": result.user.id,
        "account_id": result.account.id,
        "model_type": result.account.model_type,
        "provider": result.account.provider.value,
        "virtual_balance": float(result.account.virtual_balance),
        "created_user": result.created_user,
        "positions_placed": positions_placed,
        "applied_model_type": result.applied_rules.get("model_type"),
        "skipped_provision": False,
    }


async def seed_firm(
    db: AsyncSession,
    tenant: Tenant,
    *,
    traders_per_firm: int,
    replace_existing: bool,
    with_positions: bool,
) -> dict[str, Any]:
    await ensure_tenant_account_catalog(
        db,
        tenant,
        include_kalshi=True,
    )
    templates = await ensure_firm_templates(db, tenant)
    plans = build_trader_plans(tenant, traders_per_firm)

    traders: list[dict[str, Any]] = []
    for plan in plans:
        row = await seed_trader(
            db,
            tenant=tenant,
            plan=plan,
            replace_existing=replace_existing,
            with_positions=with_positions,
        )
        traders.append(row)
        logger.info(
            "[%s] %s model=%s size=$%s provider=%s created_user=%s positions=%s",
            tenant.slug,
            row["email"],
            row["model_type"],
            int(row["virtual_balance"]),
            row["provider"],
            row["created_user"],
            row["positions_placed"],
        )

    await db.flush()
    return {
        "tenant": tenant.slug,
        "templates_ensured": templates,
        "traders": traders,
    }


async def run_seed(
    *,
    traders_per_firm: int = DEFAULT_TRADERS_PER_FIRM,
    tenant_slug: str | None = None,
    replace_existing: bool = False,
    with_positions: bool = True,
) -> list[dict[str, Any]]:
    async with SessionLocal() as db:
        query = select(Tenant).where(Tenant.is_active).order_by(Tenant.slug)
        if tenant_slug:
            query = query.where(Tenant.slug == tenant_slug)
        result = await db.execute(query)
        tenants = list(result.scalars().all())
        if not tenants:
            logger.warning(
                "No prop firms found%s. Run the base DB seed first "
                "(start the API in development, or call seed_database).",
                f" for slug={tenant_slug!r}" if tenant_slug else "",
            )
            return []

        summaries: list[dict[str, Any]] = []
        for tenant in tenants:
            summary = await seed_firm(
                db,
                tenant,
                traders_per_firm=traders_per_firm,
                replace_existing=replace_existing,
                with_positions=with_positions,
            )
            summaries.append(summary)
        await db.commit()
        return summaries


async def _async_main(args: argparse.Namespace) -> int:
    traders_per_firm = max(3, min(5, args.traders_per_firm))
    if traders_per_firm != args.traders_per_firm:
        logger.info("Clamped --traders-per-firm to %s (allowed 3–5)", traders_per_firm)

    try:
        summaries = await run_seed(
            traders_per_firm=traders_per_firm,
            tenant_slug=args.tenant_slug,
            replace_existing=args.replace,
            with_positions=args.with_positions,
        )
    finally:
        await engine.dispose()

    total = sum(len(s["traders"]) for s in summaries)
    logger.info("Done — %s firm(s), %s trader(s) seeded", len(summaries), total)
    for summary in summaries:
        models = sorted({t["model_type"] for t in summary["traders"]})
        logger.info(
            "  %s → %s traders, model types %s",
            summary["tenant"],
            len(summary["traders"]),
            ", ".join(models),
        )
    return 0 if summaries else 1


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed idempotent test traders for every prop firm.",
    )
    parser.add_argument(
        "--traders-per-firm",
        type=int,
        default=DEFAULT_TRADERS_PER_FIRM,
        help="How many test traders to create per firm (clamped to 3–5). Default: 4",
    )
    parser.add_argument(
        "--tenant-slug",
        type=str,
        default=None,
        help="Only seed this prop firm slug (default: all active tenants)",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Reset existing seed traders' demo accounts (default: leave in place)",
    )
    parser.add_argument(
        "--with-positions",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Place sample LMSR positions for empty portfolios (default: on)",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Debug logging",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    return asyncio.run(_async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
