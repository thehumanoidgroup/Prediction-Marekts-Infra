"""Add challenge_configs, prop_firm_accounts, and trader_demo_accounts."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260714_market_providers"
down_revision: Union[str, None] = "20260714_live_events_external"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

market_provider = sa.Enum("internal", "polymarket", "kalshi", name="marketprovider")
challenge_status = sa.Enum("active", "passed", "failed", name="challengestatus")


def upgrade() -> None:
    market_provider.create(op.get_bind(), checkfirst=True)
    challenge_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "challenge_configs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("provider", market_provider, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("starting_balance", sa.Float(), nullable=False),
        sa.Column("profit_target_pct", sa.Float(), nullable=False),
        sa.Column("max_daily_loss_pct", sa.Float(), nullable=False),
        sa.Column("max_drawdown_pct", sa.Float(), nullable=False),
        sa.Column("drawdown_mode", sa.String(length=32), nullable=False),
        sa.Column("profit_split_pct", sa.Float(), nullable=False),
        sa.Column("max_stake_per_order", sa.Float(), nullable=True),
        sa.Column("max_exposure_per_market", sa.Float(), nullable=True),
        sa.Column("max_total_exposure", sa.Float(), nullable=True),
        sa.Column("challenge_duration_days", sa.Integer(), nullable=False),
        sa.Column("min_trading_days", sa.Integer(), nullable=False),
        sa.Column("kalshi_market_tickers", sa.JSON(), nullable=True),
        sa.Column("polymarket_condition_ids", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_challenge_configs_tenant_id", "challenge_configs", ["tenant_id"])

    op.create_table(
        "prop_firm_accounts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("challenge_config_id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=63), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("provider", market_provider, nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("kalshi_market_tickers", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["challenge_config_id"], ["challenge_configs.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_prop_firm_accounts_tenant_slug"),
    )
    op.create_index("ix_prop_firm_accounts_tenant_id", "prop_firm_accounts", ["tenant_id"])

    op.create_table(
        "trader_demo_accounts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("prop_firm_account_id", sa.String(length=36), nullable=True),
        sa.Column("challenge_config_id", sa.String(length=36), nullable=False),
        sa.Column("provider", market_provider, nullable=False),
        sa.Column("status", challenge_status, nullable=False),
        sa.Column("starting_balance", sa.Float(), nullable=False),
        sa.Column("kalshi_market_tickers", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prop_firm_account_id"], ["prop_firm_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["challenge_config_id"], ["challenge_configs.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_trader_demo_accounts_tenant_user"),
    )
    op.create_index("ix_trader_demo_accounts_tenant_id", "trader_demo_accounts", ["tenant_id"])
    op.create_index("ix_trader_demo_accounts_user_id", "trader_demo_accounts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_trader_demo_accounts_user_id", table_name="trader_demo_accounts")
    op.drop_index("ix_trader_demo_accounts_tenant_id", table_name="trader_demo_accounts")
    op.drop_table("trader_demo_accounts")
    op.drop_index("ix_prop_firm_accounts_tenant_id", table_name="prop_firm_accounts")
    op.drop_table("prop_firm_accounts")
    op.drop_index("ix_challenge_configs_tenant_id", table_name="challenge_configs")
    op.drop_table("challenge_configs")
    challenge_status.drop(op.get_bind(), checkfirst=True)
    market_provider.drop(op.get_bind(), checkfirst=True)
