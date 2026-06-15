"""Admin authentication: password check + JWT issue/verify + FastAPI guard.

Credentials live server-side (env), never in the client bundle. Mutating
endpoints depend on `require_admin`; reads stay public.
"""
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

_bearer = HTTPBearer(auto_error=False)
_ALGO = "HS256"


def verify_admin(username: str, password: str) -> bool:
    if not secrets.compare_digest(username, settings.ADMIN_USERNAME):
        return False
    if settings.ADMIN_PASSWORD_HASH:
        try:
            # .strip(): env managers (Vercel/Render) can append a trailing newline
            return bcrypt.checkpw(
                password.encode(), settings.ADMIN_PASSWORD_HASH.strip().encode()
            )
        except ValueError:
            return False
    if settings.ADMIN_PASSWORD:
        return secrets.compare_digest(password, settings.ADMIN_PASSWORD)
    return False  # no credentials configured -> login disabled


def create_admin_token(username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": "admin",
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=_ALGO)


def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Dependency: 401 unless a valid admin JWT is presented."""
    if creds is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Admin authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(creds.credentials, settings.JWT_SECRET, algorithms=[_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("role") != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")
    return payload.get("sub", "")


def optional_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> bool:
    """Dependency: True if a valid admin JWT is presented, else False (no raise)."""
    if creds is None:
        return False
    try:
        payload = jwt.decode(creds.credentials, settings.JWT_SECRET, algorithms=[_ALGO])
    except jwt.PyJWTError:
        return False
    return payload.get("role") == "admin"
