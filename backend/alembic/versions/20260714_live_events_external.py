"""Add external source to live_events enum."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260714_live_events_external"
down_revision: Union[str, None] = "20260714_live_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite stores enum values as plain strings; PostgreSQL needs type extension.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE liveeventsource ADD VALUE IF NOT EXISTS 'external'")


def downgrade() -> None:
    # PostgreSQL cannot easily remove enum values; no-op for portability.
    pass
