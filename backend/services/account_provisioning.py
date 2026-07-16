"""Account provisioning: challenge configs, firm products, and trader demo accounts."""

from __future__ import annotations

import logging
import re
import secrets
import string
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.engine.risk import ChallengeStatus
from app.models import (
    ChallengeConfig,
    IssuanceSource,
    MarketProvider,
    PropFirmAccount,
    SoldAccount,
    Tenant,
    TraderDemoAccount,
    User,
    UserRole,
)
from app.models.tenant import DEFAULT_PROGRAM
from integrations.kalshi import KalshiClient
from integrations.kalshi.kalshi_service import normalize_kalshi_market
from services.challenge_presets import (
    MODEL_TYPE_PRESETS,
    challenge_config_to_dict,
    resolve_challenge_rules,
)
from services.email_service import AccountCredentialsEmail, send_account_credentials_email

logger = logging.getLogger(__name__)

ProviderName = Literal["internal", "polymarket", "kalshi", "sp500_dynamic"]

DEFAULT_KALSHI_TICKERS = [
    "KXBTC-25DEC31",
    "KXFED-25DEC31",
]

DEFAULT_KALSHI_CATEGORIES = ("crypto", "economics", "stocks")

# Liquid S&P 500 universe linked to newly issued sp500_dynamic evaluation accounts.
DEFAULT_SP500_TICKERS = (
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "TSLA",
    "JPM",
    "V",
    "UNH",
    "XOM",
    "JNJ",
    "WMT",
    "MA",
    "PG",
    "HD",
    "BAC",
    "AMD",
    "COST",
    "NFLX",
)

_KALSHI_CATEGORY_PATTERNS: dict[str, re.Pattern[str]] = {
    "crypto": re.compile(r"\b(btc|bitcoin|eth|ethereum|crypto|solana|xrp)\b", re.I),
    "economics": re.compile(r"\b(fed|cpi|inflation|gdp|election|president|rate)\b", re.I),
    "stocks": re.compile(r"\b(nvda|aapl|tsla|s&p|nasdaq|stock|equity)\b", re.I),
    "commodities": re.compile(r"\b(oil|gold|crude|weather|temperature)\b", re.I),
}


@dataclass(frozen=True, slots=True)
class ProvisionResult:
    """Outcome of :func:`provision_new_account`."""

    user: User
    account: TraderDemoAccount
    sold_record: SoldAccount
    created_user: bool
    temporary_password: str | None
    email_sent: bool
    kalshi_market_tickers: list[str]
    applied_rules: dict[str, Any]


def _rules_to_preview(rules: dict[str, Any], *, model_type: str, account_size: float) -> dict[str, Any]:
    return {
        "model_type": model_type,
        "account_size": account_size,
        "currency": rules.get("currency", "USD"),
        "profit_target_pct": float(rules.get("profit_target_pct", 10)),
        "max_daily_loss_pct": float(rules.get("max_daily_loss_pct", 5)),
        "max_drawdown_pct": float(rules.get("max_drawdown_pct", 10)),
        "drawdown_mode": str(rules.get("drawdown_mode", "static")),
        "max_stake_per_order": rules.get("max_stake_per_order"),
        "max_exposure_per_market": rules.get("max_exposure_per_market"),
        "max_total_exposure": rules.get("max_total_exposure"),
        "min_consistency_score": rules.get("min_consistency_score"),
        "min_trading_days": int(rules.get("min_trading_days", 10)),
        "challenge_duration_days": int(rules.get("challenge_duration_days", 60)),
        "profit_split_pct": float(rules.get("profit_split_pct", 80)),
        "provider": str(rules.get("provider", "kalshi")),
    }


async def _load_template_config(
    db: AsyncSession,
    tenant_id: str,
    template_config_id: str | None,
) -> ChallengeConfig | None:
    if not template_config_id:
        return None
    if template_config_id.startswith("sp500-"):
        return None
    result = await db.execute(
        select(ChallengeConfig).where(
            ChallengeConfig.id == template_config_id,
            ChallengeConfig.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


def _builtin_template_overrides(template_config_id: str | None) -> dict[str, Any] | None:
    if not template_config_id or not template_config_id.startswith("sp500-"):
        return None
    for built_in in _sp500_stock_event_templates():
        if built_in["id"] == template_config_id:
            rules = built_in["rules"]
            return {
                "profit_target_pct": rules["profit_target_pct"],
                "max_daily_loss_pct": rules["max_daily_loss_pct"],
                "max_drawdown_pct": rules["max_drawdown_pct"],
                "drawdown_mode": rules["drawdown_mode"],
                "max_stake_per_order": rules.get("max_stake_per_order"),
                "max_exposure_per_market": rules.get("max_exposure_per_market"),
                "max_total_exposure": rules.get("max_total_exposure"),
                "min_consistency_score": rules.get("min_consistency_score"),
                "min_trading_days": rules["min_trading_days"],
                "challenge_duration_days": rules["challenge_duration_days"],
                "profit_split_pct": rules["profit_split_pct"],
                "provider": MarketProvider.SP500_DYNAMIC.value,
                "model_type": rules["model_type"],
                "starting_balance": rules["account_size"],
            }
    return None


def _merge_challenge_overrides(
    challenge_rules: dict[str, Any] | None,
    template_config_id: str | None,
) -> dict[str, Any] | None:
    builtin = _builtin_template_overrides(template_config_id)
    if not builtin and not challenge_rules:
        return challenge_rules
    merged = {**(builtin or {}), **(challenge_rules or {})}
    return merged or None


async def preview_issuance_rules(
    db: AsyncSession,
    *,
    tenant: Tenant,
    provider: MarketProvider,
    account_size: int,
    model_type: str = "1step",
    template_config_id: str | None = None,
    challenge_rules: dict[str, Any] | None = None,
    prop_firm_account_slug: str | None = None,
) -> dict[str, Any]:
    """Resolve the challenge rules that would apply for an issuance."""
    if provider is MarketProvider.KALSHI:
        await ensure_tenant_account_catalog(db, tenant, include_kalshi=True)

    product: PropFirmAccount | None = None
    if prop_firm_account_slug:
        product = await get_prop_firm_account_by_slug(db, tenant.id, prop_firm_account_slug)
    if product is None and provider is not MarketProvider.INTERNAL:
        product = await get_prop_firm_account_for_provider(db, tenant.id, provider)
    if product is None:
        product = await get_default_prop_firm_account(db, tenant.id)
    if product is None:
        product = await ensure_tenant_account_catalog(
            db,
            tenant,
            include_kalshi=provider is MarketProvider.KALSHI,
            include_sp500=provider is MarketProvider.SP500_DYNAMIC,
        )

    loaded = await db.execute(
        select(PropFirmAccount)
        .where(PropFirmAccount.id == product.id)
        .options(selectinload(PropFirmAccount.challenge_config))
    )
    product = loaded.scalar_one()

    template = await _load_template_config(db, tenant.id, template_config_id)
    base = challenge_config_to_dict(template or product.challenge_config)
    base["provider"] = provider.value

    resolved = resolve_challenge_rules(
        base=base,
        model_type=model_type,
        account_size=float(account_size),
        overrides=_merge_challenge_overrides(challenge_rules, template_config_id),
    )
    return _rules_to_preview(resolved, model_type=model_type, account_size=float(account_size))


async def _create_issuance_challenge_config(
    db: AsyncSession,
    *,
    tenant: Tenant,
    product: PropFirmAccount,
    provider: MarketProvider,
    account_size: float,
    model_type: str,
    template_config_id: str | None,
    challenge_rules: dict[str, Any] | None,
) -> ChallengeConfig:
    template = await _load_template_config(db, tenant.id, template_config_id)
    base = challenge_config_to_dict(template or product.challenge_config)
    base["provider"] = provider.value

    resolved = resolve_challenge_rules(
        base=base,
        model_type=model_type,
        account_size=account_size,
        overrides=_merge_challenge_overrides(challenge_rules, template_config_id),
    )

    label_prefix = {
        MarketProvider.KALSHI: "Kalshi",
        MarketProvider.SP500_DYNAMIC: "S&P 500",
        MarketProvider.POLYMARKET: "Polymarket",
        MarketProvider.INTERNAL: "Internal",
    }.get(provider, provider.value)
    label = f"{label_prefix} {model_type.upper()} ${int(account_size / 1000)}K"
    config = ChallengeConfig(
        tenant_id=tenant.id,
        name=label,
        provider=provider,
        currency=str(resolved.get("currency", "USD")),
        starting_balance=account_size,
        profit_target_pct=float(resolved["profit_target_pct"]),
        max_daily_loss_pct=float(resolved["max_daily_loss_pct"]),
        max_drawdown_pct=float(resolved["max_drawdown_pct"]),
        drawdown_mode=str(resolved.get("drawdown_mode", "static")),
        profit_split_pct=float(resolved.get("profit_split_pct", 80)),
        max_stake_per_order=resolved.get("max_stake_per_order"),
        max_exposure_per_market=resolved.get("max_exposure_per_market"),
        max_total_exposure=resolved.get("max_total_exposure"),
        challenge_duration_days=int(resolved.get("challenge_duration_days", 60)),
        min_trading_days=int(resolved.get("min_trading_days", 10)),
        model_type=model_type,
        min_consistency_score=resolved.get("min_consistency_score"),
        kalshi_market_tickers=product.kalshi_market_tickers or product.challenge_config.kalshi_market_tickers,
        sp500_tickers=(
            list(product.challenge_config.sp500_tickers)
            if product.challenge_config and product.challenge_config.sp500_tickers
            else list(DEFAULT_SP500_TICKERS)
            if provider is MarketProvider.SP500_DYNAMIC
            else None
        ),
    )
    db.add(config)
    await db.flush()
    return config


async def list_challenge_templates(
    db: AsyncSession,
    *,
    tenant_id: str,
    provider: MarketProvider | None = None,
) -> list[dict[str, Any]]:
    """List reusable challenge configs and firm products for template copy."""
    stmt = (
        select(PropFirmAccount)
        .where(PropFirmAccount.tenant_id == tenant_id, PropFirmAccount.is_active.is_(True))
        .options(selectinload(PropFirmAccount.challenge_config))
        .order_by(PropFirmAccount.is_default.desc(), PropFirmAccount.label)
    )
    if provider is not None:
        stmt = stmt.where(PropFirmAccount.provider == provider)

    result = await db.execute(stmt)
    templates: list[dict[str, Any]] = []
    for product in result.scalars().all():
        cfg = product.challenge_config
        rules = _rules_to_preview(
            challenge_config_to_dict(cfg),
            model_type=cfg.model_type,
            account_size=float(cfg.starting_balance),
        )
        templates.append(
            {
                "id": cfg.id,
                "name": cfg.name,
                "provider": cfg.provider.value,
                "prop_firm_account_id": product.id,
                "prop_firm_slug": product.slug,
                "prop_firm_label": product.label,
                "rules": rules,
            }
        )

    # Built-in stock-event templates for S&P 500 Dynamic Markets issuance UI.
    if provider is None or provider is MarketProvider.SP500_DYNAMIC:
        for built_in in _sp500_stock_event_templates():
            if any(t["id"] == built_in["id"] for t in templates):
                continue
            templates.append(built_in)

    if provider is MarketProvider.SP500_DYNAMIC:
        builtins = [t for t in templates if str(t["id"]).startswith("sp500-")]
        products = [t for t in templates if not str(t["id"]).startswith("sp500-")]
        return builtins + products

    return templates


def _sp500_stock_event_templates() -> list[dict[str, Any]]:
    """Pre-filled challenge rule templates for 0DTE / weekly stock events."""
    specs = [
        (
            "sp500-0dte-standard",
            "0DTE Stock Events · Standard",
            "sp500-0dte",
            "S&P 500 0DTE",
            "1step",
            25_000,
            {
                "profit_target_pct": 8,
                "max_daily_loss_pct": 4,
                "max_drawdown_pct": 8,
                "drawdown_mode": "static",
                "max_stake_per_order": 1_250,
                "max_exposure_per_market": 2_500,
                "min_trading_days": 5,
                "challenge_duration_days": 30,
                "profit_split_pct": 80,
            },
        ),
        (
            "sp500-weekly-standard",
            "Weekly Stock Events · Standard",
            "sp500-weekly",
            "S&P 500 Weekly",
            "1step",
            50_000,
            {
                "profit_target_pct": 10,
                "max_daily_loss_pct": 5,
                "max_drawdown_pct": 10,
                "drawdown_mode": "trailing",
                "max_stake_per_order": 2_500,
                "max_exposure_per_market": 5_000,
                "min_trading_days": 7,
                "challenge_duration_days": 45,
                "profit_split_pct": 80,
            },
        ),
        (
            "sp500-0dte-aggressive",
            "0DTE Stock Events · Aggressive",
            "sp500-0dte-agg",
            "S&P 500 0DTE Aggressive",
            "instant",
            25_000,
            {
                "profit_target_pct": 12,
                "max_daily_loss_pct": 3,
                "max_drawdown_pct": 6,
                "drawdown_mode": "static",
                "max_stake_per_order": 1_000,
                "max_exposure_per_market": 2_000,
                "min_trading_days": 3,
                "challenge_duration_days": 21,
                "profit_split_pct": 85,
                "min_consistency_score": 0.55,
            },
        ),
    ]
    out: list[dict[str, Any]] = []
    for tid, name, slug, label, model_type, size, overrides in specs:
        base = {
            "currency": "USD",
            "starting_balance": float(size),
            "provider": MarketProvider.SP500_DYNAMIC.value,
            **overrides,
        }
        resolved = resolve_challenge_rules(
            base=base,
            model_type=model_type,
            account_size=float(size),
            overrides=None,
        )
        out.append(
            {
                "id": tid,
                "name": name,
                "provider": MarketProvider.SP500_DYNAMIC.value,
                "prop_firm_account_id": None,
                "prop_firm_slug": slug,
                "prop_firm_label": label,
                "rules": _rules_to_preview(
                    resolved, model_type=model_type, account_size=float(size)
                ),
            }
        )
    return out


def list_model_type_presets(*, account_size: int = 25_000, provider: str = "kalshi") -> list[dict[str, Any]]:
    """Built-in model type presets for the issuance UI."""
    labels = {
        "1step": ("1-Step Evaluation", "Single phase · standard profit target"),
        "2step": ("2-Step Evaluation", "Verification phase · tighter drawdown"),
        "3step": ("3-Step Evaluation", "Extended evaluation · consistency required"),
        "instant": ("Instant Funding", "Accelerated path · higher target"),
    }
    base = {
        "currency": "USD",
        "starting_balance": float(account_size),
        "max_stake_per_order": 2500.0,
        "max_exposure_per_market": 5000.0,
        "max_total_exposure": None,
        "provider": provider,
    }
    presets: list[dict[str, Any]] = []
    for model_type, fields in MODEL_TYPE_PRESETS.items():
        resolved = resolve_challenge_rules(
            base={**base, **fields},
            model_type=model_type,
            account_size=float(account_size),
            overrides=None,
        )
        label, desc = labels.get(model_type, (model_type, ""))
        presets.append(
            {
                "model_type": model_type,
                "label": label,
                "description": desc,
                "rules": _rules_to_preview(
                    resolved, model_type=model_type, account_size=float(account_size)
                ),
            }
        )
    return presets


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
        "model_type": str(program.get("model_type", "evaluation")),
        "min_consistency_score": program.get("min_consistency_score"),
    }


def _parse_provider(provider: str | MarketProvider) -> MarketProvider:
    if isinstance(provider, MarketProvider):
        return provider
    try:
        return MarketProvider(provider.lower())
    except ValueError as exc:
        raise ValueError(f"Unsupported provider: {provider!r}") from exc


def _generate_temporary_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _kalshi_market_category(raw: dict[str, Any]) -> str:
    normalized = normalize_kalshi_market(
        {
            "ticker": raw.get("ticker") or "UNKNOWN",
            "title": raw.get("title") or "",
            "event_ticker": raw.get("event_ticker"),
            "series_ticker": raw.get("series_ticker"),
            "status": raw.get("status") or "active",
            "yes_bid_dollars": raw.get("yes_bid_dollars"),
            "yes_ask_dollars": raw.get("yes_ask_dollars"),
            "last_price_dollars": raw.get("last_price_dollars"),
            "volume_fp": raw.get("volume_fp") or raw.get("volume_24h_fp"),
            "close_time": raw.get("close_time"),
        }
    )
    return str(normalized.get("category") or "economics")


def _market_matches_categories(raw: dict[str, Any], categories: set[str]) -> bool:
    if not categories:
        return True
    category = _kalshi_market_category(raw)
    if category in categories:
        return True
    haystack = " ".join(
        [
            str(raw.get("title") or ""),
            str(raw.get("ticker") or ""),
            str(raw.get("event_ticker") or ""),
        ]
    )
    for name in categories:
        pattern = _KALSHI_CATEGORY_PATTERNS.get(name)
        if pattern and pattern.search(haystack):
            return True
    return False


async def fetch_kalshi_live_markets(
    *,
    categories: list[str] | None = None,
    max_per_category: int = 5,
    max_total: int = 20,
) -> list[str]:
    """Fetch top open Kalshi market tickers, optionally filtered by category."""
    selected_categories = {c.lower() for c in (categories or DEFAULT_KALSHI_CATEGORIES)}
    per_category: dict[str, list[tuple[float, str]]] = {cat: [] for cat in selected_categories}
    fallback: list[tuple[float, str]] = []

    client = KalshiClient.from_settings()
    try:
        async for market in client.iter_markets(status="open", max_pages=5, limit=200):
            ticker = str(market.get("ticker") or "").strip()
            if not ticker:
                continue
            volume = float(market.get("volume_24h_fp") or market.get("volume_fp") or 0.0)
            category = _kalshi_market_category(market)
            if category in per_category and len(per_category[category]) < max_per_category:
                per_category[category].append((volume, ticker))
            elif _market_matches_categories(market, selected_categories):
                for cat in selected_categories:
                    if len(per_category[cat]) < max_per_category:
                        per_category[cat].append((volume, ticker))
                        break
            else:
                fallback.append((volume, ticker))
    finally:
        await client.aclose()

    tickers: list[str] = []
    for cat in selected_categories:
        ranked = sorted(per_category[cat], key=lambda item: item[0], reverse=True)
        for _, ticker in ranked:
            if ticker not in tickers:
                tickers.append(ticker)
            if len(tickers) >= max_total:
                return tickers

    for _, ticker in sorted(fallback, key=lambda item: item[0], reverse=True):
        if ticker not in tickers:
            tickers.append(ticker)
        if len(tickers) >= max_total:
            break

    if not tickers:
        logger.warning("Kalshi API returned no markets — using default ticker allowlist")
        return list(DEFAULT_KALSHI_TICKERS)

    logger.info("Fetched %s Kalshi tickers for provisioning", len(tickers))
    return tickers


async def ensure_tenant_account_catalog(
    db: AsyncSession,
    tenant: Tenant,
    *,
    include_kalshi: bool = False,
    include_sp500: bool = False,
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
        if include_kalshi:
            await _ensure_kalshi_product(db, tenant)
        if include_sp500:
            await _ensure_sp500_product(db, tenant)
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
        await _ensure_kalshi_product(db, tenant, program_fields=_program_to_challenge_fields(program))
    if include_sp500:
        await _ensure_sp500_product(db, tenant, program_fields=_program_to_challenge_fields(program))

    await db.flush()
    await db.refresh(internal_product, attribute_names=["challenge_config"])
    logger.info("Provisioned account catalog for tenant %s", tenant.slug)
    return internal_product


async def _ensure_kalshi_product(
    db: AsyncSession,
    tenant: Tenant,
    *,
    program_fields: dict[str, Any] | None = None,
) -> PropFirmAccount | None:
    result = await db.execute(
        select(PropFirmAccount).where(
            PropFirmAccount.tenant_id == tenant.id,
            PropFirmAccount.slug == "kalshi",
        )
    )
    if result.scalar_one_or_none() is not None:
        return None

    fields = program_fields or _program_to_challenge_fields(
        {**DEFAULT_PROGRAM, **(tenant.program or {})}
    )
    kalshi_config = ChallengeConfig(
        tenant_id=tenant.id,
        name="Kalshi Evaluation",
        provider=MarketProvider.KALSHI,
        kalshi_market_tickers=list(DEFAULT_KALSHI_TICKERS),
        **fields,
    )
    db.add(kalshi_config)
    await db.flush()

    product = PropFirmAccount(
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
    db.add(product)
    await db.flush()
    return product


async def _ensure_sp500_product(
    db: AsyncSession,
    tenant: Tenant,
    *,
    program_fields: dict[str, Any] | None = None,
) -> PropFirmAccount | None:
    """Seed the S&P 500 Dynamic Markets evaluation product for a tenant."""
    result = await db.execute(
        select(PropFirmAccount).where(
            PropFirmAccount.tenant_id == tenant.id,
            PropFirmAccount.slug == "sp500-dynamic",
        )
    )
    if result.scalar_one_or_none() is not None:
        return None

    fields = program_fields or _program_to_challenge_fields(
        {**DEFAULT_PROGRAM, **(tenant.program or {})}
    )
    # Stock-event defaults: slightly tighter daily loss for 0DTE / weekly flows.
    fields = {
        **fields,
        "profit_target_pct": float(fields.get("profit_target_pct", 8)),
        "max_daily_loss_pct": float(fields.get("max_daily_loss_pct", 4)),
        "max_drawdown_pct": float(fields.get("max_drawdown_pct", 8)),
        "min_trading_days": int(fields.get("min_trading_days", 5)),
        "challenge_duration_days": int(fields.get("challenge_duration_days", 30)),
    }
    sp500_config = ChallengeConfig(
        tenant_id=tenant.id,
        name="S&P 500 Dynamic Markets",
        provider=MarketProvider.SP500_DYNAMIC,
        sp500_tickers=list(DEFAULT_SP500_TICKERS),
        **fields,
    )
    db.add(sp500_config)
    await db.flush()

    product = PropFirmAccount(
        tenant_id=tenant.id,
        challenge_config_id=sp500_config.id,
        slug="sp500-dynamic",
        label="S&P 500 Dynamic Markets",
        description="Trade 0DTE and weekly S&P 500 stock-event prediction markets.",
        provider=MarketProvider.SP500_DYNAMIC,
        is_default=False,
        is_active=True,
    )
    db.add(product)
    await db.flush()
    return product


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
        .options(selectinload(PropFirmAccount.challenge_config))
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


async def get_prop_firm_account_for_provider(
    db: AsyncSession,
    tenant_id: str,
    provider: MarketProvider,
) -> PropFirmAccount | None:
    result = await db.execute(
        select(PropFirmAccount)
        .where(
            PropFirmAccount.tenant_id == tenant_id,
            PropFirmAccount.provider == provider,
            PropFirmAccount.is_active.is_(True),
        )
        .order_by(PropFirmAccount.is_default.desc())
        .options(selectinload(PropFirmAccount.challenge_config))
    )
    return result.scalars().first()


def _resolve_provider(
    prop_firm_account: PropFirmAccount,
    *,
    provider: MarketProvider | None = None,
) -> MarketProvider:
    if provider is not None:
        return provider
    return prop_firm_account.provider or prop_firm_account.challenge_config.provider


async def _find_or_create_user(
    db: AsyncSession,
    *,
    tenant: Tenant,
    email: str,
    display_name: str | None,
    generate_credentials: bool,
) -> tuple[User, bool, str | None]:
    normalized_email = email.strip().lower()
    result = await db.execute(
        select(User).where(User.tenant_id == tenant.id, User.email == normalized_email)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing, False, None

    temp_password = _generate_temporary_password() if generate_credentials else None
    user = User(
        tenant_id=tenant.id,
        email=normalized_email,
        display_name=display_name or normalized_email.split("@")[0].title(),
        hashed_password=hash_password(temp_password or _generate_temporary_password()),
        role=UserRole.TRADER,
    )
    db.add(user)
    await db.flush()
    return user, True, temp_password


async def _upsert_trader_demo_account(
    db: AsyncSession,
    *,
    user: User,
    tenant: Tenant,
    product: PropFirmAccount,
    provider: MarketProvider,
    account_size: float,
    kalshi_tickers: list[str] | None,
    replace_existing: bool,
    challenge_config_id: str | None = None,
    model_type: str | None = None,
) -> TraderDemoAccount:
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
    if existing is not None and not replace_existing:
        return existing

    config = product.challenge_config
    resolved_model_type = model_type or config.model_type
    config_id = challenge_config_id or product.challenge_config_id
    ticker_list = list(kalshi_tickers) if kalshi_tickers else None

    if existing is not None:
        existing.prop_firm_account_id = product.id
        existing.challenge_config_id = config_id
        existing.provider = provider
        existing.starting_balance = account_size
        existing.virtual_balance = account_size
        existing.model_type = resolved_model_type
        existing.kalshi_market_tickers = ticker_list
        existing.status = ChallengeStatus.ACTIVE
        account = existing
    else:
        account = TraderDemoAccount(
            tenant_id=tenant.id,
            user_id=user.id,
            prop_firm_account_id=product.id,
            challenge_config_id=config_id,
            provider=provider,
            starting_balance=account_size,
            virtual_balance=account_size,
            model_type=resolved_model_type,
            kalshi_market_tickers=ticker_list,
            status=ChallengeStatus.ACTIVE,
        )
        db.add(account)

    await db.flush()
    await db.refresh(account, attribute_names=["challenge_config", "prop_firm_account"])
    return account


async def _log_sold_account(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    account: TraderDemoAccount,
    provider: MarketProvider,
    issuance_source: IssuanceSource,
    account_size: float,
    model_type: str,
    kalshi_tickers: list[str],
    credentials_generated: bool,
    email_sent: bool,
    issued_by_user_id: str | None,
    external_order_id: str | None,
    metadata: dict[str, Any] | None,
) -> SoldAccount:
    record = SoldAccount(
        tenant_id=tenant.id,
        user_id=user.id,
        trader_demo_account_id=account.id,
        provider=provider,
        issuance_source=issuance_source,
        account_size=account_size,
        model_type=model_type,
        trader_email=user.email,
        trader_display_name=user.display_name,
        external_order_id=external_order_id,
        kalshi_market_tickers=kalshi_tickers or None,
        credentials_generated=credentials_generated,
        email_sent=email_sent,
        issued_by_user_id=issued_by_user_id,
        metadata_json=metadata,
    )
    db.add(record)
    await db.flush()
    logger.info(
        "Sold account logged id=%s tenant=%s provider=%s source=%s email=%s size=%s",
        record.id,
        tenant.slug,
        provider.value,
        issuance_source.value,
        user.email,
        int(account_size),
    )
    return record


async def provision_new_account(
    db: AsyncSession,
    *,
    tenant: Tenant,
    email: str,
    provider: ProviderName | MarketProvider = "internal",
    account_size: int = 25_000,
    display_name: str | None = None,
    issuance_source: IssuanceSource = IssuanceSource.MANUAL,
    prop_firm_account_slug: str | None = None,
    kalshi_categories: list[str] | None = None,
    replace_existing: bool = True,
    external_order_id: str | None = None,
    issued_by_user_id: str | None = None,
    send_credentials_email: bool = True,
    metadata: dict[str, Any] | None = None,
    model_type: str = "1step",
    template_config_id: str | None = None,
    challenge_rules: dict[str, Any] | None = None,
) -> ProvisionResult:
    """Provision a trader evaluation account (new or existing user).

    When ``provider="kalshi"``:
    - Fetches live Kalshi markets for the requested categories
    - Links the account to Kalshi as its market data source
    - Applies challenge rules (model type, profit target, drawdowns, stake limits)

    Supports webhook purchases and manual Prop Firm Admin issuance.
    """
    resolved_provider = _parse_provider(provider)
    account_size_f = float(account_size)
    if account_size_f <= 0:
        raise ValueError("account_size must be positive")

    if resolved_provider is MarketProvider.KALSHI:
        await ensure_tenant_account_catalog(db, tenant, include_kalshi=True)
    elif resolved_provider is MarketProvider.SP500_DYNAMIC:
        await ensure_tenant_account_catalog(db, tenant, include_sp500=True)

    product: PropFirmAccount | None = None
    if prop_firm_account_slug:
        product = await get_prop_firm_account_by_slug(db, tenant.id, prop_firm_account_slug)
    if product is None and resolved_provider is not MarketProvider.INTERNAL:
        product = await get_prop_firm_account_for_provider(db, tenant.id, resolved_provider)
    if product is None:
        product = await get_default_prop_firm_account(db, tenant.id)
    if product is None:
        product = await ensure_tenant_account_catalog(
            db,
            tenant,
            include_kalshi=resolved_provider is MarketProvider.KALSHI,
            include_sp500=resolved_provider is MarketProvider.SP500_DYNAMIC,
        )

    loaded = await db.execute(
        select(PropFirmAccount)
        .where(PropFirmAccount.id == product.id)
        .options(selectinload(PropFirmAccount.challenge_config))
    )
    product = loaded.scalar_one()

    issuance_config: ChallengeConfig | None = None
    if template_config_id or challenge_rules or model_type not in {product.challenge_config.model_type, "evaluation"}:
        issuance_config = await _create_issuance_challenge_config(
            db,
            tenant=tenant,
            product=product,
            provider=resolved_provider,
            account_size=account_size_f,
            model_type=model_type,
            template_config_id=template_config_id,
            challenge_rules=challenge_rules,
        )

    applied_rules = await preview_issuance_rules(
        db,
        tenant=tenant,
        provider=resolved_provider,
        account_size=int(account_size_f),
        model_type=model_type,
        template_config_id=template_config_id,
        challenge_rules=challenge_rules,
        prop_firm_account_slug=prop_firm_account_slug,
    )

    kalshi_tickers: list[str] = []
    if resolved_provider is MarketProvider.KALSHI:
        kalshi_tickers = await fetch_kalshi_live_markets(categories=kalshi_categories)
    elif product.kalshi_market_tickers:
        kalshi_tickers = list(product.kalshi_market_tickers)
    elif issuance_config and issuance_config.kalshi_market_tickers:
        kalshi_tickers = list(issuance_config.kalshi_market_tickers)
    elif product.challenge_config.kalshi_market_tickers:
        kalshi_tickers = list(product.challenge_config.kalshi_market_tickers)

    generate_credentials = issuance_source in {
        IssuanceSource.WEBHOOK,
        IssuanceSource.MANUAL,
    }
    user, created_user, temporary_password = await _find_or_create_user(
        db,
        tenant=tenant,
        email=email,
        display_name=display_name,
        generate_credentials=generate_credentials,
    )

    account = await _upsert_trader_demo_account(
        db,
        user=user,
        tenant=tenant,
        product=product,
        provider=resolved_provider,
        account_size=account_size_f,
        kalshi_tickers=kalshi_tickers,
        replace_existing=replace_existing,
        challenge_config_id=issuance_config.id if issuance_config else None,
        model_type=model_type,
    )

    from app.core.config import get_settings
    from app.runtime.store import get_trading_store

    get_trading_store().reset_session(
        tenant.slug,
        str(user.id),
        account.to_program_dict(),
        provider=account.provider.value,
        kalshi_market_tickers=account.effective_kalshi_tickers(),
        demo_account_id=account.id,
    )

    email_sent = False
    if send_credentials_email and (created_user or issuance_source is IssuanceSource.MANUAL):
        settings = get_settings()
        login_url = f"{settings.trader_login_base_url.rstrip('/')}?tenant={tenant.slug}"
        email_sent = await send_account_credentials_email(
            AccountCredentialsEmail(
                to_email=user.email,
                display_name=user.display_name,
                tenant_name=tenant.name,
                provider=resolved_provider.value,
                account_size=account_size_f,
                login_url=login_url,
                temporary_password=temporary_password if created_user else None,
            )
        )

    sold_record = await _log_sold_account(
        db,
        tenant=tenant,
        user=user,
        account=account,
        provider=resolved_provider,
        issuance_source=issuance_source,
        account_size=account_size_f,
        model_type=model_type,
        kalshi_tickers=account.effective_kalshi_tickers(),
        credentials_generated=bool(temporary_password),
        email_sent=email_sent,
        issued_by_user_id=issued_by_user_id,
        external_order_id=external_order_id,
        metadata=metadata,
    )

    return ProvisionResult(
        user=user,
        account=account,
        sold_record=sold_record,
        created_user=created_user,
        temporary_password=temporary_password,
        email_sent=email_sent,
        kalshi_market_tickers=account.effective_kalshi_tickers(),
        applied_rules=applied_rules,
    )


async def provision_trader_demo_account(
    db: AsyncSession,
    *,
    user: User,
    tenant: Tenant,
    prop_firm_account: PropFirmAccount | None = None,
    provider: MarketProvider | None = None,
) -> TraderDemoAccount:
    """Legacy helper — creates a demo account from signup defaults."""
    slug = prop_firm_account.slug if prop_firm_account else None
    resolved_provider = provider
    if resolved_provider is None and prop_firm_account is not None:
        resolved_provider = prop_firm_account.provider
    result = await provision_new_account(
        db,
        tenant=tenant,
        email=user.email,
        display_name=user.display_name,
        provider=resolved_provider or MarketProvider.INTERNAL,
        account_size=int((tenant.program or {}).get("account_sizes", [25_000])[0]),
        issuance_source=IssuanceSource.SIGNUP,
        prop_firm_account_slug=slug,
        replace_existing=False,
        send_credentials_email=False,
    )
    return result.account


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


async def list_sold_accounts(
    db: AsyncSession,
    *,
    tenant_id: str | None = None,
    limit: int = 100,
) -> list[SoldAccount]:
    query = select(SoldAccount).order_by(SoldAccount.created_at.desc()).limit(limit)
    if tenant_id:
        query = query.where(SoldAccount.tenant_id == tenant_id)
    result = await db.execute(query)
    return list(result.scalars().all())
