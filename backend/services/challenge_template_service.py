"""Per-firm challenge templates (1-step / 2-step / 3-step / instant).

Dashboard and provisioning call the module-level helpers (or
:class:`ChallengeTemplateService`) with an ``AsyncSession``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ChallengeConfig,
    MaxBetSizeMode,
    PropFirmAccount,
    PropFirmChallengeTemplate,
    PropFirmModelTypeChoice,
    TraderDemoAccount,
)
from services.challenge_presets import MODEL_TYPE_PRESETS

# Default stake cap when a firm has not saved a template yet.
_DEFAULT_MAX_BET_SIZE_PERCENT = 2.0

_VALID_MODEL_TYPES = frozenset(m.value for m in PropFirmModelTypeChoice)

# Keys accepted by save_or_update_template (template columns + ChallengeConfig aliases).
_TEMPLATE_DATA_ALIASES: dict[str, str] = {
    "profit_target": "profit_target",
    "profit_target_pct": "profit_target",
    "daily_drawdown": "daily_drawdown",
    "max_daily_loss_pct": "daily_drawdown",
    "max_drawdown": "max_drawdown",
    "max_drawdown_pct": "max_drawdown",
    "max_bet_size_per_pick": "max_bet_size_per_pick",
    "max_stake_per_order": "max_bet_size_per_pick",
    "max_bet_size_mode": "max_bet_size_mode",
    "max_bet_size_rules": "max_bet_size_rules",
    "consistency_score": "consistency_score",
    "min_consistency_score": "consistency_score",
    "min_trading_days": "min_trading_days",
    "other_rules": "other_rules",
}

_OTHER_RULES_CONFIG_KEYS = (
    "drawdown_mode",
    "profit_split_pct",
    "challenge_duration_days",
    "max_exposure_per_market",
    "max_total_exposure",
    "currency",
)


def normalize_model_type(model_type: str) -> str:
    """Normalize model type labels to canonical values (e.g. ``1-step`` → ``1step``)."""
    raw = str(model_type or "").strip().lower().replace("-", "").replace("_", "").replace(" ", "")
    aliases = {
        "onestep": PropFirmModelTypeChoice.ONE_STEP.value,
        "1step": PropFirmModelTypeChoice.ONE_STEP.value,
        "twostep": PropFirmModelTypeChoice.TWO_STEP.value,
        "2step": PropFirmModelTypeChoice.TWO_STEP.value,
        "threestep": PropFirmModelTypeChoice.THREE_STEP.value,
        "3step": PropFirmModelTypeChoice.THREE_STEP.value,
        "instant": PropFirmModelTypeChoice.INSTANT.value,
        "instantfunding": PropFirmModelTypeChoice.INSTANT.value,
    }
    resolved = aliases.get(raw, str(model_type or "").strip().lower())
    if resolved not in _VALID_MODEL_TYPES:
        raise ValueError(
            f"Invalid model_type {model_type!r}; expected one of {sorted(_VALID_MODEL_TYPES)}"
        )
    return resolved


def is_persisted_template(template: PropFirmChallengeTemplate) -> bool:
    """True when the template row exists in the database (not an ephemeral default)."""
    return bool(getattr(template, "id", None))


def default_template_fields(model_type: str) -> dict[str, Any]:
    """Built-in defaults for a model type (mirrors :data:`MODEL_TYPE_PRESETS`)."""
    mt = normalize_model_type(model_type)
    preset = MODEL_TYPE_PRESETS.get(mt, MODEL_TYPE_PRESETS["1step"])
    other_rules: dict[str, Any] = {}
    for key in _OTHER_RULES_CONFIG_KEYS:
        if key in preset and preset[key] is not None:
            other_rules[key] = preset[key]
    return {
        "model_type": mt,
        "profit_target": float(preset.get("profit_target_pct", 10.0)),
        "daily_drawdown": float(preset.get("max_daily_loss_pct", 5.0)),
        "max_drawdown": float(preset.get("max_drawdown_pct", 10.0)),
        "max_bet_size_per_pick": _DEFAULT_MAX_BET_SIZE_PERCENT,
        "max_bet_size_mode": MaxBetSizeMode.PERCENT.value,
        "max_bet_size_rules": None,
        "consistency_score": preset.get("min_consistency_score"),
        "min_trading_days": preset.get("min_trading_days"),
        "other_rules": other_rules,
    }


def build_default_template(
    prop_firm_id: str,
    model_type: str,
) -> PropFirmChallengeTemplate:
    """Ephemeral (unsaved) template populated from built-in model presets."""
    fields = default_template_fields(model_type)
    return PropFirmChallengeTemplate(
        prop_firm_id=prop_firm_id,
        model_type=fields["model_type"],
        profit_target=fields["profit_target"],
        daily_drawdown=fields["daily_drawdown"],
        max_drawdown=fields["max_drawdown"],
        max_bet_size_per_pick=fields["max_bet_size_per_pick"],
        max_bet_size_mode=fields["max_bet_size_mode"],
        max_bet_size_rules=fields["max_bet_size_rules"],
        consistency_score=fields["consistency_score"],
        min_trading_days=fields["min_trading_days"],
        other_rules=dict(fields["other_rules"] or {}),
    )


def template_to_dict(template: PropFirmChallengeTemplate) -> dict[str, Any]:
    """Serialize a template (persisted or default) for API / dashboard responses."""
    return {
        "id": template.id,
        "prop_firm_id": template.prop_firm_id,
        "model_type": template.model_type,
        "profit_target": float(template.profit_target),
        "daily_drawdown": float(template.daily_drawdown),
        "max_drawdown": float(template.max_drawdown),
        "max_bet_size_per_pick": float(template.max_bet_size_per_pick),
        "max_bet_size_mode": template.max_bet_size_mode,
        "max_bet_size_rules": template.max_bet_size_rules,
        "consistency_score": template.consistency_score,
        "min_trading_days": template.min_trading_days,
        "other_rules": dict(template.other_rules or {}),
        "is_default": not is_persisted_template(template),
        "challenge_fields": template.to_challenge_fields(),
    }


def firm_template_rule_overrides(template: PropFirmChallengeTemplate) -> dict[str, Any]:
    """Map a firm template onto issuance override keys for :func:`resolve_challenge_rules`."""
    mapped = template.to_challenge_fields()
    overrides: dict[str, Any] = {
        "profit_target_pct": mapped["profit_target_pct"],
        "max_daily_loss_pct": mapped["max_daily_loss_pct"],
        "max_drawdown_pct": mapped["max_drawdown_pct"],
        "model_type": mapped["model_type"],
    }
    if mapped.get("min_consistency_score") is not None:
        overrides["min_consistency_score"] = mapped["min_consistency_score"]
    if mapped.get("min_trading_days") is not None:
        overrides["min_trading_days"] = mapped["min_trading_days"]
    if mapped.get("max_stake_per_order") is not None:
        overrides["max_stake_per_order"] = mapped["max_stake_per_order"]
    elif template.max_bet_size_mode == MaxBetSizeMode.FIXED.value:
        overrides["max_stake_per_order"] = float(template.max_bet_size_per_pick)
    other = mapped.get("other_rules") or {}
    for key in _OTHER_RULES_CONFIG_KEYS:
        if key in other and other[key] is not None:
            overrides[key] = other[key]
    return overrides


def _normalize_template_data(data: dict[str, Any]) -> dict[str, Any]:
    """Accept template column names or ChallengeConfig aliases."""
    if not data:
        return {}
    normalized: dict[str, Any] = {}
    other_rules = dict(data.get("other_rules") or {})
    for key, value in data.items():
        if key == "other_rules" or value is None:
            continue
        column = _TEMPLATE_DATA_ALIASES.get(key)
        if column:
            if column == "max_bet_size_mode":
                mode = str(value).strip().lower()
                if mode not in {m.value for m in MaxBetSizeMode}:
                    raise ValueError(f"Invalid max_bet_size_mode {value!r}")
                normalized[column] = mode
            else:
                normalized[column] = value
            continue
        if key in _OTHER_RULES_CONFIG_KEYS:
            other_rules[key] = value
    if other_rules or "other_rules" in data:
        normalized["other_rules"] = other_rules
    # When fixed stake is provided via max_stake_per_order without mode, default to fixed.
    if "max_bet_size_per_pick" in normalized and "max_bet_size_mode" not in normalized:
        if "max_stake_per_order" in data and "max_bet_size_per_pick" not in data:
            normalized["max_bet_size_mode"] = MaxBetSizeMode.FIXED.value
    return normalized


def _resolve_challenge_config(account: Any) -> ChallengeConfig:
    if isinstance(account, ChallengeConfig):
        return account
    config = getattr(account, "challenge_config", None)
    if config is None:
        raise ValueError(
            "Account has no challenge_config loaded; eager-load challenge_config before applying"
        )
    return config


class ChallengeTemplateService:
    """Session-scoped helper for firm challenge templates."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_template_for_model(
        self,
        prop_firm_id: str,
        model_type: str,
    ) -> PropFirmChallengeTemplate:
        """Return the saved firm template, or built-in defaults (unsaved ORM instance)."""
        mt = normalize_model_type(model_type)
        result = await self.db.execute(
            select(PropFirmChallengeTemplate).where(
                PropFirmChallengeTemplate.prop_firm_id == prop_firm_id,
                PropFirmChallengeTemplate.model_type == mt,
            )
        )
        template = result.scalar_one_or_none()
        if template is not None:
            return template
        return build_default_template(prop_firm_id, mt)

    async def get_all_templates_for_prop_firm(
        self,
        prop_firm_id: str,
        *,
        include_defaults: bool = True,
    ) -> list[PropFirmChallengeTemplate]:
        """List templates for a firm; optionally fill missing model types with defaults."""
        result = await self.db.execute(
            select(PropFirmChallengeTemplate)
            .where(PropFirmChallengeTemplate.prop_firm_id == prop_firm_id)
            .order_by(PropFirmChallengeTemplate.model_type)
        )
        saved = {t.model_type: t for t in result.scalars().all()}
        if not include_defaults:
            return list(saved.values())

        ordered: list[PropFirmChallengeTemplate] = []
        for mt in (
            PropFirmModelTypeChoice.ONE_STEP.value,
            PropFirmModelTypeChoice.TWO_STEP.value,
            PropFirmModelTypeChoice.THREE_STEP.value,
            PropFirmModelTypeChoice.INSTANT.value,
        ):
            ordered.append(saved.get(mt) or build_default_template(prop_firm_id, mt))
        return ordered

    async def save_or_update_template(
        self,
        prop_firm_id: str,
        model_type: str,
        data: dict[str, Any],
    ) -> PropFirmChallengeTemplate:
        """Create or update the unique ``(prop_firm_id, model_type)`` template."""
        mt = normalize_model_type(model_type)
        payload = _normalize_template_data(data)
        existing = await self.db.execute(
            select(PropFirmChallengeTemplate).where(
                PropFirmChallengeTemplate.prop_firm_id == prop_firm_id,
                PropFirmChallengeTemplate.model_type == mt,
            )
        )
        template = existing.scalar_one_or_none()
        if template is None:
            defaults = default_template_fields(mt)
            template = PropFirmChallengeTemplate(
                prop_firm_id=prop_firm_id,
                model_type=mt,
                profit_target=float(payload.get("profit_target", defaults["profit_target"])),
                daily_drawdown=float(payload.get("daily_drawdown", defaults["daily_drawdown"])),
                max_drawdown=float(payload.get("max_drawdown", defaults["max_drawdown"])),
                max_bet_size_per_pick=float(
                    payload.get("max_bet_size_per_pick", defaults["max_bet_size_per_pick"])
                ),
                max_bet_size_mode=str(
                    payload.get("max_bet_size_mode", defaults["max_bet_size_mode"])
                ),
                max_bet_size_rules=payload.get(
                    "max_bet_size_rules", defaults["max_bet_size_rules"]
                ),
                consistency_score=payload.get(
                    "consistency_score", defaults["consistency_score"]
                ),
                min_trading_days=payload.get("min_trading_days", defaults["min_trading_days"]),
                other_rules=dict(
                    payload.get("other_rules", defaults["other_rules"]) or {}
                ),
            )
            self.db.add(template)
        else:
            if "profit_target" in payload:
                template.profit_target = float(payload["profit_target"])
            if "daily_drawdown" in payload:
                template.daily_drawdown = float(payload["daily_drawdown"])
            if "max_drawdown" in payload:
                template.max_drawdown = float(payload["max_drawdown"])
            if "max_bet_size_per_pick" in payload:
                template.max_bet_size_per_pick = float(payload["max_bet_size_per_pick"])
            if "max_bet_size_mode" in payload:
                template.max_bet_size_mode = str(payload["max_bet_size_mode"])
            if "max_bet_size_rules" in payload:
                template.max_bet_size_rules = payload["max_bet_size_rules"]
            if "consistency_score" in payload:
                template.consistency_score = payload["consistency_score"]
            if "min_trading_days" in payload:
                template.min_trading_days = payload["min_trading_days"]
            if "other_rules" in payload:
                template.other_rules = dict(payload["other_rules"] or {})

        await self.db.flush()
        await self.db.refresh(template)
        return template

    async def apply_template_to_account(
        self,
        account: PropFirmAccount | TraderDemoAccount | ChallengeConfig,
        template: PropFirmChallengeTemplate,
    ) -> ChallengeConfig:
        """Copy template rules onto the account's :class:`ChallengeConfig` and set ``template_id``."""
        config = _resolve_challenge_config(account)
        mapped = template.to_challenge_fields()
        config.profit_target_pct = float(mapped["profit_target_pct"])
        config.max_daily_loss_pct = float(mapped["max_daily_loss_pct"])
        config.max_drawdown_pct = float(mapped["max_drawdown_pct"])
        config.model_type = str(mapped["model_type"])
        if mapped.get("min_consistency_score") is not None:
            config.min_consistency_score = float(mapped["min_consistency_score"])
        if mapped.get("min_trading_days") is not None:
            config.min_trading_days = int(mapped["min_trading_days"])
        if mapped.get("max_stake_per_order") is not None:
            config.max_stake_per_order = float(mapped["max_stake_per_order"])
        elif template.max_bet_size_mode == MaxBetSizeMode.FIXED.value:
            config.max_stake_per_order = float(template.max_bet_size_per_pick)

        other = mapped.get("other_rules") or {}
        if "drawdown_mode" in other and other["drawdown_mode"] is not None:
            config.drawdown_mode = str(other["drawdown_mode"])
        if "profit_split_pct" in other and other["profit_split_pct"] is not None:
            config.profit_split_pct = float(other["profit_split_pct"])
        if "challenge_duration_days" in other and other["challenge_duration_days"] is not None:
            config.challenge_duration_days = int(other["challenge_duration_days"])
        if "max_exposure_per_market" in other and other["max_exposure_per_market"] is not None:
            config.max_exposure_per_market = float(other["max_exposure_per_market"])
        if "max_total_exposure" in other and other["max_total_exposure"] is not None:
            config.max_total_exposure = float(other["max_total_exposure"])
        if "currency" in other and other["currency"]:
            config.currency = str(other["currency"])

        if is_persisted_template(template):
            config.template_id = template.id
        else:
            config.template_id = None

        await self.db.flush()
        return config


# ---------------------------------------------------------------------------
# Module-level API (dashboard + provisioning)
# ---------------------------------------------------------------------------


async def get_template_for_model(
    db: AsyncSession,
    prop_firm_id: str,
    model_type: str,
) -> PropFirmChallengeTemplate:
    return await ChallengeTemplateService(db).get_template_for_model(prop_firm_id, model_type)


async def get_all_templates_for_prop_firm(
    db: AsyncSession,
    prop_firm_id: str,
    *,
    include_defaults: bool = True,
) -> list[PropFirmChallengeTemplate]:
    return await ChallengeTemplateService(db).get_all_templates_for_prop_firm(
        prop_firm_id,
        include_defaults=include_defaults,
    )


async def save_or_update_template(
    db: AsyncSession,
    prop_firm_id: str,
    model_type: str,
    data: dict[str, Any],
) -> PropFirmChallengeTemplate:
    return await ChallengeTemplateService(db).save_or_update_template(
        prop_firm_id, model_type, data
    )


async def apply_template_to_account(
    db: AsyncSession,
    account: PropFirmAccount | TraderDemoAccount | ChallengeConfig,
    template: PropFirmChallengeTemplate,
) -> ChallengeConfig:
    return await ChallengeTemplateService(db).apply_template_to_account(account, template)


async def load_account_with_challenge_config(
    db: AsyncSession,
    *,
    prop_firm_account_id: str | None = None,
    trader_demo_account_id: str | None = None,
) -> PropFirmAccount | TraderDemoAccount:
    """Load an account with ``challenge_config`` eager-loaded for :func:`apply_template_to_account`."""
    if prop_firm_account_id:
        result = await db.execute(
            select(PropFirmAccount)
            .where(PropFirmAccount.id == prop_firm_account_id)
            .options(selectinload(PropFirmAccount.challenge_config))
        )
        account = result.scalar_one_or_none()
        if account is None:
            raise ValueError(f"PropFirmAccount {prop_firm_account_id} not found")
        return account
    if trader_demo_account_id:
        result = await db.execute(
            select(TraderDemoAccount)
            .where(TraderDemoAccount.id == trader_demo_account_id)
            .options(selectinload(TraderDemoAccount.challenge_config))
        )
        account = result.scalar_one_or_none()
        if account is None:
            raise ValueError(f"TraderDemoAccount {trader_demo_account_id} not found")
        return account
    raise ValueError("Provide prop_firm_account_id or trader_demo_account_id")
