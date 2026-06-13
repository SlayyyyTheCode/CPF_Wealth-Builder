"""add income_tax_brackets + rstu_caps to policy_snapshots

Revision ID: 0004_tax_config
Revises: 0003_simulation_runs
Create Date: 2026-06-10
"""
import json

from alembic import op
import sqlalchemy as sa

from app.policy.tax_brackets import INCOME_TAX_2026, RSTU_CAPS_2026

revision = "0004_tax_config"
down_revision = "0003_simulation_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("policy_snapshots", sa.Column("income_tax_brackets", sa.JSON(), nullable=True))
    op.add_column("policy_snapshots", sa.Column("rstu_caps", sa.JSON(), nullable=True))
    # populate the existing 2026 snapshot
    ps = sa.table(
        "policy_snapshots",
        sa.column("effective_year", sa.Integer),
        sa.column("income_tax_brackets", sa.JSON),
        sa.column("rstu_caps", sa.JSON),
    )
    op.execute(
        ps.update()
        .where(ps.c.effective_year == 2026)
        .values(income_tax_brackets=INCOME_TAX_2026, rstu_caps=RSTU_CAPS_2026)
    )


def downgrade() -> None:
    op.drop_column("policy_snapshots", "rstu_caps")
    op.drop_column("policy_snapshots", "income_tax_brackets")
