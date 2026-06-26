"""add residency to member_profiles

Revision ID: 0011_member_residency
Revises: 0010_srs_config
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_member_residency"
down_revision = "0010_srs_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "member_profiles",
        sa.Column("residency", sa.String(length=16), nullable=False,
                  server_default="citizen"),
    )


def downgrade() -> None:
    op.drop_column("member_profiles", "residency")
