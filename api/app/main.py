import time

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db


def create_app() -> FastAPI:
    app = FastAPI(title="CPF Builder API")
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
