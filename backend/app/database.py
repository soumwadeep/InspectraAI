"""SQLAlchemy database setup and session management."""
from __future__ import annotations

import uuid
from typing import Any, Generator

from sqlalchemy import create_engine, event, Enum, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


def enable_sqlite_foreign_keys(target_engine) -> None:
    """Turn on FK enforcement, which SQLite disables per connection by default.

    Without this, a row written with a bogus ``organization_id`` is accepted
    silently and then disappears from every org-filtered query — a missing record
    is far harder to notice than an integrity error. Applied to the app engine at
    import and to the test engine from conftest.
    """

    is_sqlite = target_engine.dialect.name == "sqlite"
    if not is_sqlite:
        return

    @event.listens_for(target_engine, "connect")
    def _pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


enable_sqlite_foreign_keys(engine)


def value_enum(enum_cls):
    """An Enum column that persists the member **value**, not the member name.

    SQLAlchemy's default writes the name. These enums deliberately use hyphenated
    values (``pending_review = "pending-review"``), so the default would store
    ``pending_review`` in the database while every API response and request says
    ``pending-review`` — any raw SQL filter, seed script or dashboard query on the
    documented value would then silently return nothing.
    """
    return Enum(
        enum_cls,
        name=enum_cls.__name__.lower(),
        values_callable=lambda cls: [member.value for member in cls],
    )


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def uuid_gen() -> str:
    """Generate a UUID4 string for primary keys."""
    return str(uuid.uuid4())


def check_db_connection() -> bool:
    """Verify database connectivity."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
