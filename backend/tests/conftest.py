"""Tests run against a real, migrated Postgres (docker-compose's pg_metadata),
never against mocks -- the entire point of the multi-tenancy and idempotency
tests is to prove real Postgres behavior (RLS, unique constraints), which a
mock would not exercise. Each test creates its own workspace(s) and tears
them down afterwards so tests are independent and repeatable against the
same dev database.

Run with pg_metadata up and migrated:
    docker compose up -d pg_metadata
    cd backend && alembic upgrade head && pytest
"""
import uuid

import pytest
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import AdminSession, workspace_scoped_session
from app.models.data_source import DataSource
from app.models.user import User
from app.models.workspace import Workspace


@pytest.fixture
def admin_db():
    db = AdminSession()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@pytest.fixture
def make_workspace(admin_db):
    created = []

    def _make(name_suffix: str = "") -> Workspace:
        ws = Workspace(name=f"Test Workspace {uuid.uuid4()} {name_suffix}")
        admin_db.add(ws)
        admin_db.flush()
        created.append(ws.id)
        return ws

    yield _make

    admin_db.commit()
    for ws_id in created:
        admin_db.execute(text('DELETE FROM "workspace" WHERE id = :id'), {"id": str(ws_id)})
    admin_db.commit()


@pytest.fixture
def make_user(admin_db):
    def _make(workspace: Workspace, email: str | None = None, can_review: bool = True) -> User:
        user = User(
            workspace_id=workspace.id,
            email=email or f"{uuid.uuid4()}@example.com",
            hashed_password=hash_password("irrelevant-for-tests"),
            can_review=can_review,
        )
        admin_db.add(user)
        admin_db.flush()
        return user

    return _make


@pytest.fixture
def make_data_source(admin_db):
    def _make(workspace: Workspace, **overrides) -> DataSource:
        defaults = dict(
            workspace_id=workspace.id,
            name="Test Source",
            host="pg_customer_demo",
            port=5432,
            dbname="demo_customer",
            username="traceline_readonly",
            encrypted_password="unused-in-most-tests",
            log_directory="/tmp/does-not-matter",
            is_production=True,
        )
        defaults.update(overrides)
        ds = DataSource(**defaults)
        admin_db.add(ds)
        admin_db.flush()
        return ds

    return _make


@pytest.fixture
def app_db_for(admin_db):
    """Returns a factory producing an RLS-scoped (traceline_app role)
    session for a given workspace -- exactly what a real request gets."""
    opened = []

    def _for(workspace: Workspace):
        db = workspace_scoped_session(workspace.id)
        opened.append(db)
        return db

    yield _for

    for db in opened:
        db.rollback()
        db.close()
