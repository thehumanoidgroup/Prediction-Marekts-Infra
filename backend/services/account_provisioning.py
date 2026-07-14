"""Account provisioning: challenge configs, firm products, and trader demo accounts."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ChallengeConfig,
    MarketProvider,
    PropFirmAccount,
    Tenant,
    TraderDemoAccount,
    User,
)
from app.models.tenant import DEFAULT_PROGRAM

logger = logging.getLogger(__name__)

DEFAULT_KALSHI_TICKERS = [
    "KXBTC-25DEC31",
    "KXFED-25DEC31",
]


def _program_to_challenge_fields(program: dict[str, Any]) -> dict[str, Any]:
    sizes = program.get("account_sizes") or DEFAULT_PROGRAM["account_sizes"]
    starting = float(program.get("starting_balance") or sizes[0])
    return {
        "currency": program.get("currency", "USD"),
        "starting_balance": starting,
        "profit_target_pct": float(program.get("profit_target_pct", 10)),
        "max_daily_loss_pct": float(program.get("max_daily_loss_pct", 5)),
        "max_drawdown_pct": float(program.get("max_drawdown_pct", 10)),
        "drawdown_mode": program.get("drawdown_mode", "static"),
        "profit_split_pct": float(program.get("profit_split_pct", 80)),
        "max_stake_per_order": program.get("max_stake_per_order"),
        "max_exposure_per_market": program.get("max_exposure_per_market"),
        "max_total_exposure": program.get("max_total_exposure"),
        "challenge_duration_days": int(program.get("challenge_duration_days", 60)),
        "min_trading_days": int(program.get("min_trading_days", 10)),
    }


async def ensure_tenant_account_catalog(
    db: AsyncSession,
    tenant: Tenant,
    *,
    include_kalshi: bool = False,
) -> PropFirmAccount:
    """Idempotently seed challenge configs and the default firm account for a tenant."""
    result = await db.execute(
        select(PropFirmAccount)
        .where(PropFirmAccount.tenant_id == tenant.id, PropFirmAccount.is_default.is_(True))
        .options(
            selectinload(PropFirmAccount.challenge_config),
            selectinload(PropFirmAccount.trader_accounts),
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    program = {**DEFAULT_PROGRAM, **(tenant.program or {})}
    internal_config = ChallengeConfig(
        tenant_id=tenant.id,
        name="Standard Evaluation",
        provider=MarketProvider.INTERNAL,
        **_program_to_challenge_fields(program),
    )
    db.add(internal_config)
    await db.flush()

    internal_product = PropFirmAccount(
        tenant_id=tenant.id,
        challenge_config_id=internal_config.id,
        slug="standard",
        label="Standard Evaluation",
        description="Trade internal LMSR markets under standard challenge rules.",
        provider=MarketProvider.INTERNAL,
        is_default=True,
        is_active=True,
    )
    db.add(internal_product)

    if include_kalshi:
        kalshi_program = _program_to_challenge_fields(program)
        kalshi_config = ChallengeConfig(
            tenant_id=tenant.id,
            name="Kalshi Evaluation",
            provider=MarketProvider.KALSHI,
            kalshi_market_tickers=list(DEFAULT_KALSHI_TICKERS),
            **kalshi_program,
        )
        db.add(kalshi_config)
        await db.flush()

        db.add(
            PropFirmAccount(
                tenant_id=tenant.id,
                challenge_config_id=kalshi_config.id,
                slug="kalshi",
                label="Kalshi Evaluation",
                description="Trade linked Kalshi prediction markets.",
                provider=MarketProvider.KALSHI,
                kalshi_market_tickers=list(DEFAULT_KALSHI_TICKERS),
                is_default=False,
                is_active=True,
            )
        )

    await db.flush()
    await db.refresh(internal_product, attribute_names=["challenge_config"])
    logger.info("Provisioned account catalog for tenant %s", tenant.slug)
    return internal_product


async def get_default_prop_firm_account(
    db: AsyncSession,
    tenant_id: str,
) -> PropFirmAccount | None:
    result = await db.execute(
        select(PropFirmAccount)
        .where(
            PropFirmAccount.tenant_id == tenant_id,
            PropFirmAccount.is_default.is_(True),
            PropFirmAccount.is_active.is_(True),
        )
        .options(
            selectinload(PropFirmAccount.challenge_config),
        )
    )
    return result.scalar_one_or_none()


async def get_prop_firm_account_by_slug(
    db: AsyncSession,
    tenant_id: str,
    slug: str,
) -> PropFirmAccount | None:
    result = await db.execute(
        select(PropFirmAccount)
        .where(
            PropFirmAccount.tenant_id == tenant_id,
            PropFirmAccount.slug == slug,
            PropFirmAccount.is_active.is_(True),
        )
        .options(selectinload(PropFirmAccount.challenge_config))
    )
    return result.scalar_one_or_none()


def _resolve_provider(
    prop_firm_account: PropFirmAccount,
    *,
    provider: MarketProvider | None = None,
) -> MarketProvider:
    if provider is not None:
        return provider
    return prop_firm_account.provider or prop_firm_account.challenge_config.provider


async def provision_trader_demo_account(
    db: AsyncSession,
    *,
    user: User,
    tenant: Tenant,
    prop_firm_account: PropFirmAccount | None = None,
    provider: MarketProvider | None = None,
) -> TraderDemoAccount:
    """Create a trader demo account from the firm's default (or selected) product."""
    result = await db.execute(
        select(TraderDemoAccount)
        .where(TraderDemoAccount.tenant_id == tenant.id, TraderDemoAccount.user_id == user.id)
        .options(
            selectinload(TraderDemoAccount.challenge_config),
            selectinload(TraderDemoAccount.prop_firm_account).selectinload(
                PropFirmAccount.challenge_config
            ),
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    product = prop_firm_account or await get_default_prop_firm_account(db, tenant.id)
    if product is None:
        product = await ensure_tenant_account_catalog(db, tenant)

    loaded = await db.execute(
        select(PropFirmAccount)
        .where(PropFirmAccount.id == product.id)
        .options(selectinload(PropFirmAccount.challenge_config))
    )
    product = loaded.scalar_one()

    resolved_provider = _resolve_provider(product, provider=provider)
    kalshi_tickers = product.kalshi_market_tickers
    if resolved_provider is MarketProvider.KALSHI and not kalshi_tickers:
        kalshi_tickers = product.challenge_config.kalshi_market_tickers

    account = TraderDemoAccount(
        tenant_id=tenant.id,
        user_id=user.id,
        prop_firm_account_id=product.id,
        challenge_config_id=product.challenge_config_id,
        provider=resolved_provider,
        starting_balance=float(product.challenge_config.starting_balance),
        kalshi_market_tickers=list(kalshi_tickers) if kalshi_tickers else None,
    )
    db.add(account)
    await db.flush()
    await db.refresh(account, attribute_names=["challenge_config", "prop_firm_account"])
    logger.info(
        "Provisioned trader demo account for %s@%s (provider=%s)",
        user.email,
        tenant.slug,
        account.provider.value,
    )
    return account


async def get_trader_demo_account(
    db: AsyncSession,
    *,
    tenant_id: str,
    user_id: str,
) -> TraderDemoAccount | None:
    result = await db.execute(
        select(TraderDemoAccount)
        .where(TraderDemoAccount.tenant_id == tenant_id, TraderDemoAccount.user_id == user_id)
        .options(
            selectinload(TraderDemoAccount.challenge_config),
            selectinload(TraderDemoAccount.prop_firm_account).selectinload(
                PropFirmAccount.challenge_config
            ),
        )
    )
    return result.scalar_one_or_none()


async def get_or_provision_trader_demo_account(
    db: AsyncSession,
    *,
    user: User,
    tenant: Tenant,
) -> TraderDemoAccount:
    account = await get_trader_demo_account(db, tenant_id=tenant.id, user_id=user.id)
    if account is not None:
        return account
    return await provision_trader_demo_account(db, user=user, tenant=tenant)
