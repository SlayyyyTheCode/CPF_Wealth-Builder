"""add special_access flag to member_profiles

Revision ID: 0007_member_special_access
Revises: 0006_assumptions
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_member_special_access"
down_revision = "0006_assumptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "member_profiles",
        sa.Column("special_access", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("member_profiles", "special_access")
