import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Serverless (Vercel) runs many short-lived containers in parallel, each with
# its own SQLAlchemy engine. A QueuePool inside every container multiplies:
# N containers x (pool_size + max_overflow) connections, which blows past a
# managed Postgres connection cap under concurrency and surfaces as "too many
# connections" — exactly the multi-user failure we care about. NullPool opens
# one connection per request and closes it, letting the platform's own pooler
# (pgbouncer behind POSTGRES_URL) do the pooling it is designed for.
#
# On a long-lived server (uvicorn on a VM/container), QueuePool is correct and
# pooling in-process is the whole point, so keep it there.
_SERVERLESS = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

# pool_pre_ping: remote managed Postgres (Neon/Vercel) drops idle connections;
# without it a stale connection surfaces as a 500 + retry, adding latency under
# load. pool_recycle keeps connections younger than typical idle-kill windows.
_pool_kwargs: dict = (
    {"poolclass": NullPool}
    if _SERVERLESS
    else {"pool_pre_ping": True, "pool_recycle": 300}
)

engine = create_engine(settings.DATABASE_URL, future=True, **_pool_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
