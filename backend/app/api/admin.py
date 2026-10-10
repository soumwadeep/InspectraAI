"""Admin endpoints: database initialization, seed data, and diagnostics."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import require_role
from app.database import Base, engine
from app.models.user import RoleEnum, User
from app.core.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/init-db", status_code=201)
async def init_database(
    _: User = Depends(require_role(RoleEnum.administrator)),
) -> dict:
    """Create all database tables (admin only)."""
    Base.metadata.create_all(bind=engine)
    return {"message": "Database tables created successfully"}


@router.post("/seed")
async def seed_initial_data(
    _: User = Depends(require_role(RoleEnum.administrator)),
) -> dict:
    """Seed the database with initial organizations, users, or equipment (admin only)."""
    from sqlalchemy.orm import Session
    from app.database import get_db

    # This is handled by dependency injection — re-import for clarity
    db = next(get_db())
    try:
        # Check if already seeded
        if db.query(User).count() > 0:
            return {"message": "Database already seeded"}

        from app.models.user import Organization
        from app.models.equipment import Equipment, EquipmentStatusEnum

        org = Organization(
            name="Inspectra Demo",
            slug="inspectra-demo",
        )
        db.add(org)
        db.flush()

        admin = User(
            email="admin@inspectra.ai",
            hashed_password=hash_password("admin123"),
            name="Admin User",
            role=RoleEnum.administrator,
            organization_id=org.id,
        )
        inspector = User(
            email="inspector@inspectra.ai",
            hashed_password=hash_password("inspector123"),
            name="Inspector User",
            role=RoleEnum.inspector,
            organization_id=org.id,
        )
        db.add(admin)
        db.add(inspector)
        db.flush()

        equipment = [
            Equipment(
                name="Turbine #1",
                category="Turbine",
                location="Plant Floor A",
                organization_id=org.id,
                status=EquipmentStatusEnum.operational,
            ),
            Equipment(
                name="Compressor #2",
                category="Compressor",
                location="Plant Floor B",
                organization_id=org.id,
                status=EquipmentStatusEnum.warning,
            ),
            Equipment(
                name="Heat Exchanger #3",
                category="Heat Exchanger",
                location="Plant Floor A",
                organization_id=org.id,
                status=EquipmentStatusEnum.critical,
            ),
        ]
        db.add_all(equipment)
        db.commit()

        return {
            "message": "Seed data created",
            "organization": org.name,
            "users": 2,
            "equipment": len(equipment),
        }
    finally:
        db.close()


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
