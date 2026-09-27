"""General API rate limiting (beyond the auth password-attempt throttle in
app/routers/member.py, which is DB-backed and covers only login attempts).

In-memory storage: fine for a single-process deploy; if this ever runs as
multiple instances behind a load balancer, swap storage_uri for a shared
backend (e.g. Redis) so limits are enforced across processes, not per-instance.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(key_func=get_remote_address, default_limits=[settings.RATE_LIMIT_DEFAULT])
