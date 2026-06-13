from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="CPF Builder API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    from app.routers.auth import router as auth_router
    from app.routers.policy import router as policy_router
    from app.routers.member import router as member_router
    from app.routers.simulation import router as simulation_router
    from app.routers.analysis import router as analysis_router

    app.include_router(auth_router)
    app.include_router(policy_router)
    app.include_router(member_router)
    app.include_router(simulation_router)
    app.include_router(analysis_router)

    return app


app = create_app()
