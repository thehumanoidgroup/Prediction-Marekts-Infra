"""Add sp500_dynamic provider + stock market fields for S&P 500 prediction markets.

Extends multi-provider support:
  internal | polymarket | kalshi | sp500_dynamic

Adds nullable stock_ticker / strike_price / expiration_type / expiration_date
on challenge_configs, prop_firm_accounts, trader_demo_accounts, and live_events.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260716_sp500_dynamic"
down_revision: Union[str, None] = "20260714_sold_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

stock_expiration_type = sa.Enum("0dte", "weekly", name="stockexpirationtype")


def _add_enum_value_postgres(type_name: str, value: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(
        sa.text(
            f"ALTER TYPE {type_name} ADD VALUE IF NOT EXISTS '{value}'"
        )
    )


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Extend marketprovider / liveeventsource enums (PostgreSQL).
    _add_enum_value_postgres("marketprovider", "sp500_dynamic")
    _add_enum_value_postgres("liveeventsource", "sp500_dynamic")

    stock_expiration_type.create(bind, checkfirst=True)

    # --- challenge_configs ---
    op.add_column("challenge_configs", sa.Column("sp500_tickers", sa.JSON(), nullable=True))
    op.add_column("challenge_configs", sa.Column("stock_ticker", sa.String(length=16), nullable=True))
    op.add_column("challenge_configs", sa.Column("strike_price", sa.Float(), nullable=True))
    op.add_column(
        "challenge_configs",
        sa.Column("expiration_type", stock_expiration_type, nullable=True),
    )
    op.add_column("challenge_configs", sa.Column("expiration_date", sa.Date(), nullable=True))
    op.create_index("ix_challenge_configs_stock_ticker", "challenge_configs", ["stock_ticker"])

    # --- prop_firm_accounts ---
    op.add_column("prop_firm_accounts", sa.Column("stock_ticker", sa.String(length=16), nullable=True))
    op.add_column("prop_firm_accounts", sa.Column("strike_price", sa.Float(), nullable=True))
    op.add_column(
        "prop_firm_accounts",
        sa.Column("expiration_type", stock_expiration_type, nullable=True),
    )
    op.add_column("prop_firm_accounts", sa.Column("expiration_date", sa.Date(), nullable=True))
    op.create_index("ix_prop_firm_accounts_stock_ticker", "prop_firm_accounts", ["stock_ticker"])

    # --- trader_demo_accounts ---
    op.add_column("trader_demo_accounts", sa.Column("stock_ticker", sa.String(length=16), nullable=True))
    op.add_column("trader_demo_accounts", sa.Column("strike_price", sa.Float(), nullable=True))
    op.add_column(
        "trader_demo_accounts",
        sa.Column("expiration_type", stock_expiration_type, nullable=True),
    )
    op.add_column("trader_demo_accounts", sa.Column("expiration_date", sa.Date(), nullable=True))
    op.create_index("ix_trader_demo_accounts_stock_ticker", "trader_demo_accounts", ["stock_ticker"])

    # --- live_events ---
    op.add_column("live_events", sa.Column("stock_ticker", sa.String(length=16), nullable=True))
    op.add_column("live_events", sa.Column("strike_price", sa.Float(), nullable=True))
    op.add_column(
        "live_events",
        sa.Column("expiration_type", stock_expiration_type, nullable=True),
    )
    op.add_column("live_events", sa.Column("expiration_date", sa.Date(), nullable=True))
    op.create_index("ix_live_events_stock_ticker", "live_events", ["stock_ticker"])

    # SQLite / other dialects store enums as strings — no ALTER TYPE needed.
    # Existing rows keep provider/source as-is (nullable stock fields = multi-provider safe).
    _ = dialect


def downgrade() -> None:
    op.drop_index("ix_live_events_stock_ticker", table_name="live_events")
    op.drop_column("live_events", "expiration_date")
    op.drop_column("live_events", "expiration_type")
    op.drop_column("live_events", "strike_price")
    op.drop_column("live_events", "stock_ticker")

    op.drop_index("ix_trader_demo_accounts_stock_ticker", table_name="trader_demo_accounts")
    op.drop_column("trader_demo_accounts", "expiration_date")
    op.drop_column("trader_demo_accounts", "expiration_type")
    op.drop_column("trader_demo_accounts", "strike_price")
    op.drop_column("trader_demo_accounts", "stock_ticker")

    op.drop_index("ix_prop_firm_accounts_stock_ticker", table_name="prop_firm_accounts")
    op.drop_column("prop_firm_accounts", "expiration_date")
    op.drop_column("prop_firm_accounts", "expiration_type")
    op.drop_column("prop_firm_accounts", "strike_price")
    op.drop_column("prop_firm_accounts", "stock_ticker")

    op.drop_index("ix_challenge_configs_stock_ticker", table_name="challenge_configs")
    op.drop_column("challenge_configs", "expiration_date")
    op.drop_column("challenge_configs", "expiration_type")
    op.drop_column("challenge_configs", "strike_price")
    op.drop_column("challenge_configs", "stock_ticker")
    op.drop_column("challenge_configs", "sp500_tickers")

    bind = op.get_bind()
    stock_expiration_type.drop(bind, checkfirst=True)
    # Enum value removal is not portable on PostgreSQL — leave sp500_dynamic in place.
