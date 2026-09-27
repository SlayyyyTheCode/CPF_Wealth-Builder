from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.security import verify_admin, create_admin_token
from app.db.session import get_db
from app.models.auth_attempt import AdminLoginAttempt

router = APIRouter(prefix="/auth", tags=["auth"])

# ── brute-force throttle for admin login ─────────────────────────────────────
# DB-backed for the same reason as the member-password throttle in
# routers/member.py: an in-process (or in-memory rate-limiter) counter does
# not hold on Vercel serverless, where each request may hit a different
# short-lived container. Global, not per-IP: there is one admin credential,
# so one shared counter is simpler and also catches a distributed attack.
_LOGIN_MAX_FAILS = 5
_LOGIN_WINDOW_SECS = 15 * 60


def _login_window_start() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=_LOGIN_WINDOW_SECS)


def _login_throttled(db: Session) -> bool:
    cutoff = _login_window_start()
    db.execute(delete(AdminLoginAttempt).where(AdminLoginAttempt.created_at < cutoff))
    db.commit()
    n = db.scalar(
        select(func.count())
        .select_from(AdminLoginAttempt)
        .where(AdminLoginAttempt.created_at >= cutoff)
    )
    return (n or 0) >= _LOGIN_MAX_FAILS


def _login_record_fail(db: Session) -> None:
    db.add(AdminLoginAttempt())
    db.commit()


def _login_clear(db: Session) -> None:
    db.execute(delete(AdminLoginAttempt))
    db.commit()


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if _login_throttled(db):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed attempts — try again in a few minutes.",
        )
    if not verify_admin(req.username, req.password):
        _login_record_fail(db)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid username or password"
        )
    _login_clear(db)
    return TokenResponse(access_token=create_admin_token(req.username))
