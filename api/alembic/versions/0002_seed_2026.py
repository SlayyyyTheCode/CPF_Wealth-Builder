"""seed 2026 policy snapshot

Revision ID: 0002_seed_2026
Revises: 0001_initial
Create Date: 2026-06-10
"""
from datetime import datetime, UTC

from alembic import op
import sqlalchemy as sa

from app.policy.seed import SEED_2026

revision = "0002_seed_2026"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    t = sa.table(
        "policy_snapshots",
        sa.column("effective_year", sa.Integer),
        sa.column("status", sa.String),
        sa.column("approved_at", sa.DateTime),
        sa.column("approved_by", sa.String),
        sa.column("frs", sa.Numeric), sa.column("brs", sa.Numeric),
        sa.column("ers", sa.Numeric), sa.column("bhs", sa.Numeric),
        sa.column("cpf_life_eligibility_min", sa.Numeric),
        sa.column("ordinary_wage_ceiling", sa.Numeric),
        sa.column("additional_wage_ceiling", sa.Numeric),
        sa.column("contribution_rates", sa.JSON),
        sa.column("allocation_rates", sa.JSON),
        sa.column("interest_rates", sa.JSON),
    )
    op.bulk_insert(t, [{
        **SEED_2026,
        "approved_at": datetime.now(UTC),
        "approved_by": "seed",
    }])


def downgrade() -> None:
    op.execute("DELETE FROM policy_snapshots WHERE effective_year = 2026")
