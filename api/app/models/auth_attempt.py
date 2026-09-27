from datetime import datetime

from sqlalchemy import Integer, DateTime, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PasswordAttempt(Base):
    """One row per FAILED member-password attempt.

    The throttle lives in the database rather than in process memory because
    the API is deployed on Vercel serverless: each request may be served by a
    different, short-lived container, so an in-process counter resets
    constantly and an attacker simply gets a fresh allowance per container.
    A shared table is the only counter every instance agrees on.

    Rows are pruned opportunistically (older than the window) on each check,
    and wiped for a member on a successful login or an admin password reset.
    """

    __tablename__ = "password_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("member_profiles.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )


# Composite index: every read is "attempts for member M since time T".
Index(
    "ix_password_attempts_member_created",
    PasswordAttempt.member_id,
    PasswordAttempt.created_at,
)


class AdminLoginAttempt(Base):
    """One row per FAILED admin login attempt — same rationale as
    PasswordAttempt above (DB-backed so the throttle survives a serverless
    cold container). Global rather than per-member: there is exactly one
    admin credential, so a single shared counter is both simpler and
    strictly stricter (it also catches a distributed, multi-IP attack that a
    per-IP limit would not)."""

    __tablename__ = "admin_login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )
