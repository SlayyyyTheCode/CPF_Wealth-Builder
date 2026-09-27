"""add admin_login_attempts table (brute-force throttle for /auth/login)

Same rationale as 0012_password_attempts: the in-process throttle does not
hold on Vercel serverless, since each container keeps its own counter. This
table is the shared counter for admin login specifically — previously
unthrottled beyond the general per-IP rate limit, which is itself
in-memory and therefore just as unreliable across serverless containers.

Revision ID: 0015_admin_login_attempts
Revises: 0014_official_medishield
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_admin_login_attempts"
down_revision = "0014_official_medishield"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_login_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_admin_login_attempts_created_at", "admin_login_attempts", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_admin_login_attempts_created_at", table_name="admin_login_attempts")
    op.drop_table("admin_login_attempts")
