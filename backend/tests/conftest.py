"""Shared fixtures: an isolated database and an authenticated test client.

The test database is created with `Base.metadata.create_all`, which the
application deliberately never does at startup — it created zero tables there
because it ran before the models were imported. Here every model module has been
imported first, so the metadata is complete; production still migrates with
Alembic only.
"""
from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import pytest

_TEST_DIR = tempfile.mkdtemp(prefix="inspectra-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR}/test.db"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["DEBUG"] = "true"

from app.database import Base, engine  # noqa: E402
import app.models  # noqa: E402,F401  populates Base.metadata
from app.core.security import hash_password  # noqa: E402
from app.models.user import Organization, RoleEnum, User  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    import shutil
    shutil.rmtree(_TEST_DIR, ignore_errors=True)


@pytest.fixture()
def storage_dir(monkeypatch, tmp_path):
    """Point StorageService at a throwaway tree so tests never touch real uploads."""
    from app.core import storage as storage_module

    root = tmp_path / "storage"
    (root / "uploads").mkdir(parents=True)
    monkeypatch.setattr(storage_module, "UPLOAD_DIR", root / "uploads")
    return root


@pytest.fixture()
def db():
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def org(db) -> Organization:
    # uuid, not id(db): a Session's memory address is reused across tests, so
    # keying the slug on it collides on the UNIQUE constraint intermittently.
    organization = Organization(name="Test Works", slug=f"test-{uuid.uuid4().hex[:12]}")
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


@pytest.fixture()
def admin(db, org) -> User:
    user = User(
        email=f"admin-{org.slug}@example.test",
        name="Test Admin",
        role=RoleEnum.administrator,
        organization_id=org.id,
        hashed_password=hash_password("test-password"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def client(admin, org):
    """TestClient with the auth dependency pinned to the fixture user."""
    from fastapi.testclient import TestClient

    from app.core.dependencies import get_current_user, get_current_organization_id, get_db
    from app.database import SessionLocal
    from app.main import app

    def _override_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_organization_id] = lambda: org.id

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
