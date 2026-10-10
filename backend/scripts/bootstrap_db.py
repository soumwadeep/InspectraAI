"""Apply the Alembic migrations in ``backend/alembic``. This is the only schema path.

    python3 -m scripts.bootstrap_db            # upgrade to head
    python3 -m scripts.bootstrap_db --status   # report current vs head
    python3 -m scripts.bootstrap_db --sql      # print SQL without connecting

Deliberately destructive-free: this module never calls ``drop_all`` and never
autogenerates. Nothing here can erase data, and Postgres targets require an
explicit flag because the same command is used against the shared VPS database.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]
INI_PATH = BACKEND_DIR / "alembic.ini"


def build_config(db_url: str | None = None) -> Config:
    cfg = Config(str(INI_PATH))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    if db_url:
        cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def head_revision(db_url: str | None = None) -> str | None:
    script = ScriptDirectory.from_config(build_config(db_url))
    return script.get_current_head()


def current_revision(db_url: str | None = None) -> str | None:
    """The revision the target database is actually on, or None if unmanaged."""
    from app.database import engine

    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def _guard_shared_database(db_url: str, allow_postgres: bool) -> None:
    if not db_url.startswith("postgresql"):
        return
    if allow_postgres:
        return
    print(
        "REFUSED: the target database is Postgres, not the local SQLite file.\n"
        f"  target: {db_url.split('@')[-1] if '@' in db_url else db_url}\n"
        "  Migrations here have only ever been verified against SQLite, because\n"
        "  Postgres is not installed on this machine. The native enum types and the\n"
        "  inspections/agent_runs foreign-key cycle are therefore untested.\n"
        "  Re-run with --allow-postgres once you have confirmed the target.",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sql", action="store_true", help="emit SQL, do not connect")
    parser.add_argument("--status", action="store_true", help="report revisions only")
    parser.add_argument("--db-url", default=None, help="override DATABASE_URL")
    parser.add_argument(
        "--allow-postgres",
        action="store_true",
        help="acknowledge that the target is a Postgres database",
    )
    args = parser.parse_args(argv)

    sys.path.insert(0, str(BACKEND_DIR))
    from app.config import settings

    db_url = args.db_url or settings.database_url
    head = head_revision(db_url)

    if args.status:
        current = current_revision(db_url)
        print(f"current: {current or 'NONE (migrations never applied)'}")
        print(f"head:    {head}")
        return 0 if current == head else 1

    if args.sql:
        cfg = build_config(db_url)
        cfg.set_main_option("sqlalchemy.url", db_url)
        command.upgrade(cfg, "head", sql=True)
        return 0

    _guard_shared_database(db_url, args.allow_postgres)

    cfg = build_config(db_url)
    command.upgrade(cfg, "head")
    applied = current_revision(db_url)
    print(f"schema revision: {applied} (head {head})")
    if applied != head:
        print("WARNING: database is not at head after upgrade.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
