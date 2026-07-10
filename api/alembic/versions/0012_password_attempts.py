"""add password_attempts table (cross-instance brute-force throttle)

The in-process throttle does not hold on Vercel serverless: each container
keeps its own counter, so an attacker gets a fresh allowance per container.
This table is the shared counter all instances read.

Revision ID: 0012_password_attempts
Revises: 0011_member_residency
Create Date: 2026-07-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_password_attempts"
down_revision = "0011_member_residency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "password_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("member_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_password_attempts_member_id", "password_attempts", ["member_id"])
    op.create_index("ix_password_attempts_created_at", "password_attempts", ["created_at"])
    op.create_index(
        "ix_password_attempts_member_created",
        "password_attempts",
        ["member_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_password_attempts_member_created", table_name="password_attempts")
    op.drop_index("ix_password_attempts_created_at", table_name="password_attempts")
    op.drop_index("ix_password_attempts_member_id", table_name="password_attempts")
    op.drop_table("password_attempts")
