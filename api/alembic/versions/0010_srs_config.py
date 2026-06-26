"""add srs config to policy_snapshots

Revision ID: 0010_srs_config
Revises: 0009_member_income_growth
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

from app.policy.tax_brackets import SRS_2026

revision = "0010_srs_config"
down_revision = "0009_member_income_growth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("policy_snapshots", sa.Column("srs", sa.JSON(), nullable=True))
    # backfill the existing 2026 snapshot
    ps = sa.table(
        "policy_snapshots",
        sa.column("effective_year", sa.Integer),
        sa.column("srs", sa.JSON),
    )
    op.execute(
        ps.update()
        .where(ps.c.effective_year == 2026)
        .values(srs=SRS_2026)
    )


def downgrade() -> None:
    op.drop_column("policy_snapshots", "srs")
