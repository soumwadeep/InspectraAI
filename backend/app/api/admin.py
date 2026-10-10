"""Admin endpoints: schema diagnostics.

Table creation is not offered over HTTP. It was ``POST /api/admin/init-db``,
which required an administrator token — an administrator could only exist once
the tables existed, so the endpoint could never be called successfully. Schema
changes now come from ``python3 -m scripts.bootstrap_db`` (Alembic), and these
endpoints only report what that produced.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import inspect

from app.core.dependencies import require_role
from app.database import Base, engine
from app.models.user import RoleEnum, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/schema-status")
async def schema_status(
    _: User = Depends(require_role(RoleEnum.administrator)),
) -> dict:
    """Compare the live database against the model definitions.

    ``missing_tables`` is the number one cause of a deployment that starts but
    500s on every query, so it is reported explicitly rather than buried in logs.
    """
    from scripts.bootstrap_db import current_revision, head_revision

    reflected = set(inspect(engine).get_table_names())
    expected = set(Base.metadata.tables)

    return {
        "current_revision": current_revision(),
        "head_revision": head_revision(),
        "tables_present": len(reflected),
        "tables_expected": len(expected),
        "missing_tables": sorted(expected - reflected),
        "unexpected_tables": sorted(reflected - expected - {"alembic_version"}),
    }


@router.get("/health")
async def health_check() -> dict:
    """Simple health endpoint (no auth required)."""
    from app.database import check_db_connection

    db_ok = check_db_connection()
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "opencv": _get_opencv_version(),
    }


def _get_opencv_version() -> str:
    import cv2
    return cv2.__version__
