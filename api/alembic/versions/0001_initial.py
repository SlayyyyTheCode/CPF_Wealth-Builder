"""create policy and member tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "policy_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("effective_year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("approved_by", sa.String(length=120), nullable=True),
        sa.Column("frs", sa.Numeric(12, 2), nullable=False),
        sa.Column("brs", sa.Numeric(12, 2), nullable=False),
        sa.Column("ers", sa.Numeric(12, 2), nullable=False),
        sa.Column("bhs", sa.Numeric(12, 2), nullable=False),
        sa.Column("cpf_life_eligibility_min", sa.Numeric(12, 2), nullable=False),
        sa.Column("ordinary_wage_ceiling", sa.Numeric(12, 2), nullable=False),
        sa.Column("additional_wage_ceiling", sa.Numeric(12, 2), nullable=False),
        sa.Column("contribution_rates", sa.JSON(), nullable=False),
        sa.Column("allocation_rates", sa.JSON(), nullable=False),
        sa.Column("interest_rates", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_policy_snapshots_effective_year",
        "policy_snapshots",
        ["effective_year"],
    )

    op.create_table(
        "member_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("dob", sa.Date(), nullable=False),
        sa.Column("monthly_gross_wage", sa.Numeric(12, 2), nullable=False),
        sa.Column("employment_status", sa.String(length=20), nullable=False),
        sa.Column("balances", sa.JSON(), nullable=False),
        sa.Column("housing_data", sa.JSON(), nullable=True),
        sa.Column("voluntary_top_ups", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("member_profiles")
    op.drop_index("ix_policy_snapshots_effective_year", table_name="policy_snapshots")
    op.drop_table("policy_snapshots")
