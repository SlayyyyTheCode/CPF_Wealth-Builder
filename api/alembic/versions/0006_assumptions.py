"""add assumptions to policy_snapshots

Revision ID: 0006_assumptions
Revises: 0005_medishield
Create Date: 2026-06-11
"""
import json

from alembic import op
import sqlalchemy as sa

from app.policy.assumptions import ASSUMPTIONS_2026

revision = "0006_assumptions"
down_revision = "0005_medishield"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("policy_snapshots", sa.Column("assumptions", sa.JSON(), nullable=True))
    # populate the existing 2026 snapshot
    ps = sa.table(
        "policy_snapshots",
        sa.column("effective_year", sa.Integer),
        sa.column("assumptions", sa.JSON),
    )
    op.execute(
        ps.update()
        .where(ps.c.effective_year == 2026)
        .values(assumptions=ASSUMPTIONS_2026)
    )


def downgrade() -> None:
    op.drop_column("policy_snapshots", "assumptions")
