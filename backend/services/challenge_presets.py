"""Challenge model presets and rule resolution for account issuance."""

from __future__ import annotations

from typing import Any

MODEL_TYPE_PRESETS: dict[str, dict[str, Any]] = {
    "1step": {
        "profit_target_pct": 10.0,
        "max_daily_loss_pct": 5.0,
        "max_drawdown_pct": 10.0,
        "drawdown_mode": "static",
        "min_trading_days": 10,
        "challenge_duration_days": 60,
        "profit_split_pct": 80.0,
        "min_consistency_score": None,
    },
    "2step": {
        "profit_target_pct": 8.0,
        "max_daily_loss_pct": 4.0,
        "max_drawdown_pct": 8.0,
        "drawdown_mode": "trailing",
        "min_trading_days": 14,
        "challenge_duration_days": 90,
        "profit_split_pct": 85.0,
        "min_consistency_score": 0.55,
    },
    "3step": {
        "profit_target_pct": 6.0,
        "max_daily_loss_pct": 3.0,
        "max_drawdown_pct": 6.0,
        "drawdown_mode": "trailing",
        "min_trading_days": 21,
        "challenge_duration_days": 120,
        "profit_split_pct": 90.0,
        "min_consistency_score": 0.6,
    },
    "instant": {
        "profit_target_pct": 12.0,
        "max_daily_loss_pct": 6.0,
        "max_drawdown_pct": 12.0,
        "drawdown_mode": "static",
        "min_trading_days": 5,
        "challenge_duration_days": 30,
        "profit_split_pct": 75.0,
        "min_consistency_score": None,
    },
}


def _scale_stake(value: float | None, account_size: float, base_balance: float) -> float | None:
    if value is None or base_balance <= 0:
        return value
    return round(float(value) * (account_size / base_balance), 2)


def resolve_challenge_rules(
    *,
    base: dict[str, Any],
    model_type: str,
    account_size: float,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge template base, model preset, custom overrides, and scale stake caps."""
    resolved = dict(base)
    preset = MODEL_TYPE_PRESETS.get(model_type, {})
    resolved.update({k: v for k, v in preset.items() if v is not None})
    if overrides:
        resolved.update({k: v for k, v in overrides.items() if v is not None})

    resolved["model_type"] = model_type
    resolved["starting_balance"] = account_size

    base_balance = float(base.get("starting_balance") or account_size)
    for field in ("max_stake_per_order", "max_exposure_per_market", "max_total_exposure"):
        if field in resolved and resolved[field] is not None:
            resolved[field] = _scale_stake(resolved[field], account_size, base_balance)

    return resolved


def challenge_config_to_dict(config: Any) -> dict[str, Any]:
    """Serialize a ChallengeConfig ORM row to a rules dict."""
    return {
        "currency": config.currency,
        "starting_balance": float(config.starting_balance),
        "profit_target_pct": float(config.profit_target_pct),
        "max_daily_loss_pct": float(config.max_daily_loss_pct),
        "max_drawdown_pct": float(config.max_drawdown_pct),
        "drawdown_mode": config.drawdown_mode,
        "profit_split_pct": float(config.profit_split_pct),
        "max_stake_per_order": config.max_stake_per_order,
        "max_exposure_per_market": config.max_exposure_per_market,
        "max_total_exposure": config.max_total_exposure,
        "challenge_duration_days": int(config.challenge_duration_days),
        "min_trading_days": int(config.min_trading_days),
        "model_type": config.model_type,
        "min_consistency_score": config.min_consistency_score,
        "provider": config.provider.value if hasattr(config.provider, "value") else config.provider,
    }
