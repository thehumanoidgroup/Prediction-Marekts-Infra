"""Add market_resolution_audits table for EOD S&P 500 settlement audit trail."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_resolution_audits"
down_revision: Union[str, None] = "20260716_sp500_dynamic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

resolution_audit_status = sa.Enum("success", "failed", "skipped", name="resolutionauditstatus")


def upgrade() -> None:
    bind = op.get_bind()
    resolution_audit_status.create(bind, checkfirst=True)

    op.create_table(
        "market_resolution_audits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("market_id", sa.String(length=128), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("stock_ticker", sa.String(length=16), nullable=True),
        sa.Column("strike_price", sa.Float(), nullable=True),
        sa.Column("close_price", sa.Float(), nullable=True),
        sa.Column("expiration_type", sa.String(length=16), nullable=True),
        sa.Column("expiration_date", sa.Date(), nullable=True),
        sa.Column("winning_outcome", sa.String(length=8), nullable=True),
        sa.Column("settlements_count", sa.Integer(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("status", resolution_audit_status, nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_market_resolution_audits_market_id", "market_resolution_audits", ["market_id"])
    op.create_index(
        "ix_market_resolution_audits_external_id", "market_resolution_audits", ["external_id"]
    )
    op.create_index("ix_market_resolution_audits_source", "market_resolution_audits", ["source"])
    op.create_index(
        "ix_market_resolution_audits_stock_ticker", "market_resolution_audits", ["stock_ticker"]
    )


def downgrade() -> None:
    op.drop_index("ix_market_resolution_audits_stock_ticker", table_name="market_resolution_audits")
    op.drop_index("ix_market_resolution_audits_source", table_name="market_resolution_audits")
    op.drop_index("ix_market_resolution_audits_external_id", table_name="market_resolution_audits")
    op.drop_index("ix_market_resolution_audits_market_id", table_name="market_resolution_audits")
    op.drop_table("market_resolution_audits")
    bind = op.get_bind()
    resolution_audit_status.drop(bind, checkfirst=True)
