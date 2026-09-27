import logging
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import limiter
from app.core.logging import init_sentry, setup_logging, timed_ms
from app.db.session import get_db

logger = logging.getLogger("app.request")


def create_app() -> FastAPI:
    setup_logging()
    sentry_enabled = init_sentry()

    app = FastAPI(title="CPF Builder API")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    # Blanket per-IP rate limit on every route (see app/core/limiter.py) — on
    # top of, not instead of, the DB-backed lockout on admin/member login.
    app.add_middleware(SlowAPIMiddleware)
    # Simulation/analysis responses are large JSON (60+ projection years of
    # nested balances); gzip cuts them ~10x on the wire, the single biggest
    # latency win for remote users on slow links.
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_origin_regex=settings.CORS_ORIGIN_REGEX or None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        """One structured log line per request, plus a full traceback for
        anything unhandled — before this, an uncaught exception surfaced only
        as a bare 500 to the client with nothing recorded anywhere. Kept as a
        single middleware (not a separate exception_handler) so it can't
        accidentally shadow FastAPI's own HTTPException/validation handling."""
        request_id = uuid.uuid4().hex[:12]
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "unhandled exception",
                extra={"request_id": request_id, "method": request.method, "path": request.url.path},
            )
            raise
        level = logging.WARNING if response.status_code >= 500 else logging.INFO
        logger.log(
            level,
            "request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": timed_ms(start),
            },
        )
        response.headers["X-Request-Id"] = request_id
        return response

    @app.get("/health/observability")
    def health_observability():
        """Confirms whether logging/Sentry are actually wired, without
        leaking the DSN itself."""
        return {"structured_logging": True, "sentry_enabled": sentry_enabled}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/health/timing")
    def health_timing(db: Session = Depends(get_db)):
        """Measure the API->DB round trip so latency can be diagnosed with real
        numbers instead of guesses. A cross-region API/DB pairing shows up here
        as tens-to-hundreds of ms on `db_roundtrip_ms`; a co-located one is
        low single digits."""
        t0 = time.perf_counter()
        db.execute(text("SELECT 1"))
        db_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"status": "ok", "db_roundtrip_ms": db_ms}

    from app.routers.auth import router as auth_router
    from app.routers.maintenance import router as maintenance_router
    from app.routers.policy import router as policy_router
    from app.routers.member import router as member_router
    from app.routers.simulation import router as simulation_router
    from app.routers.analysis import router as analysis_router

    app.include_router(auth_router)
    app.include_router(maintenance_router)
    app.include_router(policy_router)
    app.include_router(member_router)
    app.include_router(simulation_router)
    app.include_router(analysis_router)

    return app


app = create_app()
