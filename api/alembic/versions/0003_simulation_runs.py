"""create simulation_runs table

Revision ID: 0003_simulation_runs
Revises: 0002_seed_2026
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_simulation_runs"
down_revision = "0002_seed_2026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "simulation_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("member_profiles.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("end_age", sa.Integer(), nullable=False),
        sa.Column("retirement_sum_target", sa.String(length=8), nullable=False),
        sa.Column("annual_bonus", sa.Numeric(12, 2), nullable=False),
        sa.Column("policy_snapshot_id", sa.Integer(),
                  sa.ForeignKey("policy_snapshots.id"), nullable=True),
        sa.Column("result", sa.JSON(), nullable=False),
    )
    op.create_index("ix_simulation_runs_member_id", "simulation_runs", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_simulation_runs_member_id", table_name="simulation_runs")
    op.drop_table("simulation_runs")
