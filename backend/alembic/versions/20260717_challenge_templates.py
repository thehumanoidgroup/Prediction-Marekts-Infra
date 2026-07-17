"""Add prop_firm_challenge_templates + ChallengeConfig.template_id.

Per-prop-firm, per-model-type challenge rule templates with unique
(prop_firm_id, model_type). Challenge configs may optionally link back
to a template for override tracking.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260717_challenge_templates"
down_revision: Union[str, None] = "20260716_resolution_audits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prop_firm_challenge_templates",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("prop_firm_id", sa.String(length=36), nullable=False),
        sa.Column("model_type", sa.String(length=32), nullable=False),
        sa.Column("profit_target", sa.Float(), nullable=False),
        sa.Column("daily_drawdown", sa.Float(), nullable=False),
        sa.Column("max_drawdown", sa.Float(), nullable=False),
        sa.Column("max_bet_size_per_pick", sa.Float(), nullable=False),
        sa.Column("max_bet_size_mode", sa.String(length=16), nullable=False, server_default="percent"),
        sa.Column("max_bet_size_rules", sa.JSON(), nullable=True),
        sa.Column("consistency_score", sa.Float(), nullable=True),
        sa.Column("min_trading_days", sa.Integer(), nullable=True),
        sa.Column("other_rules", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["prop_firm_id"],
            ["tenants.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "prop_firm_id",
            "model_type",
            name="uq_prop_firm_challenge_templates_firm_model",
        ),
    )
    op.create_index(
        "ix_prop_firm_challenge_templates_prop_firm_id",
        "prop_firm_challenge_templates",
        ["prop_firm_id"],
    )
    op.create_index(
        "ix_prop_firm_challenge_templates_model_type",
        "prop_firm_challenge_templates",
        ["model_type"],
    )

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("challenge_configs") as batch_op:
            batch_op.add_column(sa.Column("template_id", sa.String(length=36), nullable=True))
            batch_op.create_foreign_key(
                "fk_challenge_configs_template_id",
                "prop_firm_challenge_templates",
                ["template_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_index(
                "ix_challenge_configs_template_id",
                ["template_id"],
            )
    else:
        op.add_column(
            "challenge_configs",
            sa.Column("template_id", sa.String(length=36), nullable=True),
        )
        op.create_index(
            "ix_challenge_configs_template_id",
            "challenge_configs",
            ["template_id"],
        )
        op.create_foreign_key(
            "fk_challenge_configs_template_id",
            "challenge_configs",
            "prop_firm_challenge_templates",
            ["template_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("challenge_configs") as batch_op:
            batch_op.drop_constraint("fk_challenge_configs_template_id", type_="foreignkey")
            batch_op.drop_index("ix_challenge_configs_template_id")
            batch_op.drop_column("template_id")
    else:
        op.drop_constraint(
            "fk_challenge_configs_template_id",
            "challenge_configs",
            type_="foreignkey",
        )
        op.drop_index("ix_challenge_configs_template_id", table_name="challenge_configs")
        op.drop_column("challenge_configs", "template_id")

    op.drop_index(
        "ix_prop_firm_challenge_templates_model_type",
        table_name="prop_firm_challenge_templates",
    )
    op.drop_index(
        "ix_prop_firm_challenge_templates_prop_firm_id",
        table_name="prop_firm_challenge_templates",
    )
    op.drop_table("prop_firm_challenge_templates")
