from typing import Any

from sqlalchemy import JSON, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDTimestampMixin

DEFAULT_BRANDING: dict[str, Any] = {
    "accent": "#22c55e",
    "accent_hover": "#16a34a",
    "accent_soft": "rgba(34, 197, 94, 0.12)",
    "accent_foreground": "#04170b",
    "logo_glyph": "P",
    "logo_url": None,
}

DEFAULT_FEATURES: dict[str, bool] = {
    "leaderboard": True,
    "journal": True,
    "payouts": True,
}

DEFAULT_PROGRAM: dict[str, Any] = {
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
}


class Tenant(Base, UUIDTimestampMixin):
    """A prop firm running its white-labeled instance of the platform.

    Every tenant-owned row in the database carries a `tenant_id` foreign
    key; every API request is scoped to exactly one tenant (resolved from
    subdomain or the `X-Tenant-Slug` header).
    """

    __tablename__ = "tenants"

    # Subdomain the firm is served from, e.g. `apex` → apex.proppredict.com
    slug: Mapped[str] = mapped_column(String(63), unique=True, index=True, nullable=False)
    # Stable client identifier used by the frontend registry (e.g. `proppredict`).
    client_key: Mapped[str] = mapped_column(String(63), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    tagline: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # White-label theming (colors, logo) applied by the frontend at runtime.
    branding: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    # Per-firm feature toggles (journal, leaderboard, payouts, ...).
    features: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    # Challenge program rules (profit target, loss limits, splits, ...).
    program: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    challenge_configs = relationship(
        "ChallengeConfig", back_populates="tenant", cascade="all, delete-orphan"
    )
    prop_firm_accounts = relationship(
        "PropFirmAccount", back_populates="tenant", cascade="all, delete-orphan"
    )
    trader_demo_accounts = relationship(
        "TraderDemoAccount", back_populates="tenant", cascade="all, delete-orphan"
    )
