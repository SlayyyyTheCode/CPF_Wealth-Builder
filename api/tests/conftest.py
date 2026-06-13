from datetime import datetime, UTC

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import create_app
from app.db.base import Base
from app.db.session import get_db
import app.models.policy as policy_model
import app.models.member  # noqa: F401  (register table)
import app.models.simulation  # noqa: F401  (register table)
from app.policy.seed import SEED_2026


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # single shared in-memory connection across threads
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
    db = TestingSessionLocal()
    db.add(
        policy_model.PolicySnapshot(
            **SEED_2026
            | {
                "status": "active",
                "approved_at": datetime.now(UTC),
                "approved_by": "seed",
            }
        )
    )
    db.commit()
    yield db
    db.close()


@pytest.fixture
def client(db_session):
    """Authenticated client (admin Bearer token) — most tests mutate data."""
    from app.core.security import create_admin_token
    from app.core.config import settings

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    token = create_admin_token(settings.ADMIN_USERNAME)
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


@pytest.fixture
def anon_client(db_session):
    """Unauthenticated client — for testing public access + 401s."""
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db_session
    return TestClient(app)
