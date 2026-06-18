"""add salary_increment_pct + bonus_months to member_profiles

Revision ID: 0009_member_income_growth
Revises: 0008_member_password
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_member_income_growth"
down_revision = "0008_member_password"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "member_profiles",
        sa.Column("salary_increment_pct", sa.Numeric(6, 4), nullable=False, server_default="0"),
    )
    op.add_column(
        "member_profiles",
        sa.Column("bonus_months", sa.Numeric(5, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("member_profiles", "bonus_months")
    op.drop_column("member_profiles", "salary_increment_pct")
