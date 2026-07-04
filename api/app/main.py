from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.config import settings


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
