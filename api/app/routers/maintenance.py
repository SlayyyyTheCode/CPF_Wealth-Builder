"""Admin-only maintenance: run DB migrations from within the deployment.

Managed-Postgres connection strings are runtime-only (not retrievable via the
CLI), so migrations run server-side against the injected env. Idempotent
(`alembic upgrade head`); guarded by require_admin.
"""
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from alembic.config import Config
from alembic import command

from app.core.security import require_admin
from app.core.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


def _norm(u: str) -> str:
    if u.startswith("postgres://"):
        u = "postgresql://" + u[len("postgres://"):]
    if u.startswith("postgresql://"):
        u = "postgresql+psycopg://" + u[len("postgresql://"):]
    return u


@router.post("/migrate")
def migrate(_: str = Depends(require_admin)):
    # Prefer a direct (unpooled) connection for DDL.
    target = (
        os.getenv("DATABASE_URL_UNPOOLED")
        or os.getenv("POSTGRES_URL_NON_POOLING")
        or settings.DATABASE_URL
    )
    target = _norm(target)
    prev = settings.DATABASE_URL
    object.__setattr__(settings, "DATABASE_URL", target)  # env.py reads this
    try:
        root = Path(__file__).resolve().parents[2]  # api/
        cfg = Config(str(root / "alembic.ini"))
        cfg.set_main_option("script_location", str(root / "alembic"))
        command.upgrade(cfg, "head")
    except Exception as exc:  # surface migration errors to the caller
        raise HTTPException(500, f"Migration failed: {exc}")
    finally:
        object.__setattr__(settings, "DATABASE_URL", prev)
    return {"status": "migrated"}
