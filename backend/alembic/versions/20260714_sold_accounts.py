"""Add sold_accounts audit log and account provisioning fields."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260714_sold_accounts"
down_revision: Union[str, None] = "20260714_market_providers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

issuance_source = sa.Enum("webhook", "manual", "signup", "system", name="issuancesource")


def upgrade() -> None:
    issuance_source.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "challenge_configs",
        sa.Column("model_type", sa.String(length=64), nullable=False, server_default="evaluation"),
    )
    op.add_column(
        "challenge_configs",
        sa.Column("min_consistency_score", sa.Float(), nullable=True),
    )

    op.add_column(
        "trader_demo_accounts",
        sa.Column(
            "virtual_balance",
            sa.Float(),
            nullable=False,
            server_default=sa.text("starting_balance"),
        ),
    )
    op.add_column(
        "trader_demo_accounts",
        sa.Column("model_type", sa.String(length=64), nullable=False, server_default="evaluation"),
    )

    op.create_table(
        "sold_accounts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("trader_demo_account_id", sa.String(length=36), nullable=True),
        sa.Column(
            "provider",
            sa.Enum("internal", "polymarket", "kalshi", name="marketprovider", create_type=False),
            nullable=False,
        ),
        sa.Column("issuance_source", issuance_source, nullable=False),
        sa.Column("account_size", sa.Float(), nullable=False),
        sa.Column("model_type", sa.String(length=64), nullable=False),
        sa.Column("trader_email", sa.String(length=255), nullable=False),
        sa.Column("trader_display_name", sa.String(length=120), nullable=False),
        sa.Column("external_order_id", sa.String(length=128), nullable=True),
        sa.Column("kalshi_market_tickers", sa.JSON(), nullable=True),
        sa.Column("credentials_generated", sa.Boolean(), nullable=False),
        sa.Column("email_sent", sa.Boolean(), nullable=False),
        sa.Column("issued_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["trader_demo_account_id"], ["trader_demo_accounts.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["issued_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sold_accounts_tenant_id", "sold_accounts", ["tenant_id"])
    op.create_index("ix_sold_accounts_external_order_id", "sold_accounts", ["external_order_id"])


def downgrade() -> None:
    op.drop_index("ix_sold_accounts_external_order_id", table_name="sold_accounts")
    op.drop_index("ix_sold_accounts_tenant_id", table_name="sold_accounts")
    op.drop_table("sold_accounts")
    op.drop_column("trader_demo_accounts", "model_type")
    op.drop_column("trader_demo_accounts", "virtual_balance")
    op.drop_column("challenge_configs", "min_consistency_score")
    op.drop_column("challenge_configs", "model_type")
    issuance_source.drop(op.get_bind(), checkfirst=True)
