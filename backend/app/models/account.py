"""Prop firm account models: challenge configs and trader evaluation accounts."""

from __future__ import annotations

import enum
from typing import Any

from sqlalchemy import (
    Boolean,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.engine.risk import ChallengeStatus, DrawdownMode
from app.models.base import Base, UUIDTimestampMixin


class MarketProvider(str, enum.Enum):
    """Liquidity / market data provider for a challenge account."""

    INTERNAL = "internal"
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"


class ChallengeConfig(Base, UUIDTimestampMixin):
    """Reusable challenge rules template, optionally scoped to a market provider.

    Firms define one or more configs (e.g. "$25K Internal", "$50K Kalshi").
    Provider-specific fields (``kalshi_market_tickers``, etc.) restrict which
    external markets traders may access during evaluation.
    """

    __tablename__ = "challenge_configs"

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    provider: Mapped[MarketProvider] = mapped_column(
        Enum(MarketProvider, values_callable=lambda e: [m.value for m in e]),
        default=MarketProvider.INTERNAL,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    currency: Mapped[str] = mapped_column(String(8), default="USD", nullable=False)
    starting_balance: Mapped[float] = mapped_column(Float, nullable=False)
    profit_target_pct: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    max_daily_loss_pct: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    max_drawdown_pct: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    drawdown_mode: Mapped[str] = mapped_column(
        String(32), default=DrawdownMode.STATIC.value, nullable=False
    )
    profit_split_pct: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    max_stake_per_order: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_exposure_per_market: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_total_exposure: Mapped[float | None] = mapped_column(Float, nullable=True)
    challenge_duration_days: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    min_trading_days: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    model_type: Mapped[str] = mapped_column(String(64), default="evaluation", nullable=False)
    min_consistency_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Provider-specific market allowlists (optional).
    kalshi_market_tickers: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    polymarket_condition_ids: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    tenant = relationship("Tenant", back_populates="challenge_configs")
    prop_firm_accounts = relationship("PropFirmAccount", back_populates="challenge_config")
    trader_accounts = relationship("TraderDemoAccount", back_populates="challenge_config")


class PropFirmAccount(Base, UUIDTimestampMixin):
    """A firm-published evaluation product (links traders to a :class:`ChallengeConfig`).

    Each tenant may expose multiple account tiers; one is marked ``is_default``
    for self-service trader signup.
    """

    __tablename__ = "prop_firm_accounts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_prop_firm_accounts_tenant_slug"),
    )

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    challenge_config_id: Mapped[str] = mapped_column(
        ForeignKey("challenge_configs.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    slug: Mapped[str] = mapped_column(String(63), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    provider: Mapped[MarketProvider] = mapped_column(
        Enum(MarketProvider, values_callable=lambda e: [m.value for m in e]),
        default=MarketProvider.INTERNAL,
        nullable=False,
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    kalshi_market_tickers: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    tenant = relationship("Tenant", back_populates="prop_firm_accounts")
    challenge_config = relationship("ChallengeConfig", back_populates="prop_firm_accounts")
    trader_accounts = relationship("TraderDemoAccount", back_populates="prop_firm_account")


class IssuanceSource(str, enum.Enum):
    """How a trader evaluation account was issued."""

    WEBHOOK = "webhook"
    MANUAL = "manual"
    SIGNUP = "signup"
    SYSTEM = "system"


class SoldAccount(Base, UUIDTimestampMixin):
    """Audit log of issued evaluation accounts for Super Admin reporting."""

    __tablename__ = "sold_accounts"

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    trader_demo_account_id: Mapped[str | None] = mapped_column(
        ForeignKey("trader_demo_accounts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    provider: Mapped[MarketProvider] = mapped_column(
        Enum(MarketProvider, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    issuance_source: Mapped[IssuanceSource] = mapped_column(
        Enum(IssuanceSource, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    account_size: Mapped[float] = mapped_column(Float, nullable=False)
    model_type: Mapped[str] = mapped_column(String(64), default="evaluation", nullable=False)
    trader_email: Mapped[str] = mapped_column(String(255), nullable=False)
    trader_display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    external_order_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    kalshi_market_tickers: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    credentials_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    issued_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)

    tenant = relationship("Tenant", back_populates="sold_accounts")
    user = relationship("User", foreign_keys=[user_id])
    trader_demo_account = relationship("TraderDemoAccount", back_populates="sold_records")
    issued_by = relationship("User", foreign_keys=[issued_by_user_id])


class TraderDemoAccount(Base, UUIDTimestampMixin):
    """A trader's active evaluation / demo challenge account."""

    __tablename__ = "trader_demo_accounts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", name="uq_trader_demo_accounts_tenant_user"),
    )

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    prop_firm_account_id: Mapped[str | None] = mapped_column(
        ForeignKey("prop_firm_accounts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    challenge_config_id: Mapped[str] = mapped_column(
        ForeignKey("challenge_configs.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    provider: Mapped[MarketProvider] = mapped_column(
        Enum(MarketProvider, values_callable=lambda e: [m.value for m in e]),
        default=MarketProvider.INTERNAL,
        nullable=False,
    )
    status: Mapped[ChallengeStatus] = mapped_column(
        Enum(ChallengeStatus, values_callable=lambda e: [m.value for m in e]),
        default=ChallengeStatus.ACTIVE,
        nullable=False,
    )
    starting_balance: Mapped[float] = mapped_column(Float, nullable=False)
    virtual_balance: Mapped[float] = mapped_column(Float, nullable=False)
    model_type: Mapped[str] = mapped_column(String(64), default="evaluation", nullable=False)
    kalshi_market_tickers: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    tenant = relationship("Tenant", back_populates="trader_demo_accounts")
    user = relationship("User", back_populates="demo_account")
    prop_firm_account = relationship("PropFirmAccount", back_populates="trader_accounts")
    challenge_config = relationship("ChallengeConfig", back_populates="trader_accounts")
    sold_records = relationship("SoldAccount", back_populates="trader_demo_account")

    def effective_kalshi_tickers(self) -> list[str]:
        """Resolved Kalshi ticker allowlist (account → firm account → config)."""
        if self.kalshi_market_tickers:
            return list(self.kalshi_market_tickers)
        if self.prop_firm_account and self.prop_firm_account.kalshi_market_tickers:
            return list(self.prop_firm_account.kalshi_market_tickers)
        if self.challenge_config and self.challenge_config.kalshi_market_tickers:
            return list(self.challenge_config.kalshi_market_tickers)
        return []

    def scaled_stake_limits(self) -> dict[str, float | None]:
        """Scale absolute stake caps relative to the config template balance."""
        cfg = self.challenge_config
        base = float(cfg.starting_balance) or self.starting_balance
        ratio = self.starting_balance / base if base > 0 else 1.0

        def scale(value: float | None) -> float | None:
            if value is None:
                return None
            return round(float(value) * ratio, 2)

        return {
            "max_stake_per_order": scale(cfg.max_stake_per_order),
            "max_exposure_per_market": scale(cfg.max_exposure_per_market),
            "max_total_exposure": scale(cfg.max_total_exposure),
        }

    def to_program_dict(self) -> dict[str, Any]:
        """Map persisted challenge rules into the tenant ``program`` shape."""
        cfg = self.challenge_config
        scaled = self.scaled_stake_limits()
        return {
            "currency": cfg.currency,
            "starting_balance": self.starting_balance,
            "virtual_balance": self.virtual_balance,
            "account_sizes": [int(self.starting_balance)],
            "profit_target_pct": cfg.profit_target_pct,
            "max_daily_loss_pct": cfg.max_daily_loss_pct,
            "max_drawdown_pct": cfg.max_drawdown_pct,
            "drawdown_mode": cfg.drawdown_mode,
            "profit_split_pct": cfg.profit_split_pct,
            "max_stake_per_order": scaled["max_stake_per_order"],
            "max_exposure_per_market": scaled["max_exposure_per_market"],
            "max_total_exposure": scaled["max_total_exposure"],
            "challenge_duration_days": cfg.challenge_duration_days,
            "min_trading_days": cfg.min_trading_days,
            "model_type": self.model_type,
            "min_consistency_score": cfg.min_consistency_score,
            "provider": self.provider.value,
            "kalshi_market_tickers": self.effective_kalshi_tickers(),
        }
