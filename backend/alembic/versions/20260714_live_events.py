"""Add live_events and event_updates tables."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260714_live_events"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "live_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column(
            "source",
            sa.Enum("internal", "polymarket", name="liveeventsource"),
            nullable=False,
        ),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            sa.Enum("open", "closing_soon", "resolved", name="liveeventstatus"),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("probabilities", sa.JSON(), nullable=False),
        sa.Column("volume", sa.Float(), nullable=False),
        sa.Column("volume_24h", sa.Float(), nullable=False),
        sa.Column("change_24h", sa.Float(), nullable=False),
        sa.Column("last_updated", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_live_events_category", "live_events", ["category"], unique=False)
    op.create_index("ix_live_events_external_id", "live_events", ["external_id"], unique=True)

    op.create_table(
        "event_updates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("probabilities_before", sa.JSON(), nullable=False),
        sa.Column("probabilities_after", sa.JSON(), nullable=False),
        sa.Column("volume_delta", sa.Float(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["live_events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_updates_event_id", "event_updates", ["event_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_event_updates_event_id", table_name="event_updates")
    op.drop_table("event_updates")
    op.drop_index("ix_live_events_external_id", table_name="live_events")
    op.drop_index("ix_live_events_category", table_name="live_events")
    op.drop_table("live_events")
    sa.Enum(name="liveeventsource").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="liveeventstatus").drop(op.get_bind(), checkfirst=True)
