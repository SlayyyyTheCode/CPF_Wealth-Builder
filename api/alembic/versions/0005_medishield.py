"""add medishield_premiums to policy_snapshots

Revision ID: 0005_medishield
Revises: 0004_tax_config
Create Date: 2026-06-11
"""
import json

from alembic import op
import sqlalchemy as sa

from app.policy.medishield import MEDISHIELD_PREMIUMS_2026

revision = "0005_medishield"
down_revision = "0004_tax_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("policy_snapshots", sa.Column("medishield_premiums", sa.JSON(), nullable=True))
    # populate the existing 2026 snapshot
    ps = sa.table(
        "policy_snapshots",
        sa.column("effective_year", sa.Integer),
        sa.column("medishield_premiums", sa.JSON),
    )
    op.execute(
        ps.update()
        .where(ps.c.effective_year == 2026)
        .values(medishield_premiums=MEDISHIELD_PREMIUMS_2026)
    )


def downgrade() -> None:
    op.drop_column("policy_snapshots", "medishield_premiums")
