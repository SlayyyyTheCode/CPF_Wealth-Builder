"""add password_hash to member_profiles

Revision ID: 0008_member_password
Revises: 0007_member_special_access
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_member_password"
down_revision = "0007_member_special_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "member_profiles",
        sa.Column("password_hash", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("member_profiles", "password_hash")
