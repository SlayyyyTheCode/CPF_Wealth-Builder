"""General per-IP API rate limiting (app/core/limiter.py, app/main.py) — on
top of, not instead of, the DB-backed login-attempt lockout in member.py.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address


def test_requests_within_limit_succeed(anon_client):
    for _ in range(5):
        r = anon_client.get("/health")
        assert r.status_code == 200


def test_exceeding_default_limit_returns_429():
    """Wired the same way as the real app (app/main.py), but with a tiny
    limit so the test doesn't need 121 requests to prove the 429 path."""
    limiter = Limiter(key_func=get_remote_address, default_limits=["3/minute"])
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    client = TestClient(app)
    statuses = [client.get("/ping").status_code for _ in range(5)]
    assert statuses[:3] == [200, 200, 200]
    assert 429 in statuses
