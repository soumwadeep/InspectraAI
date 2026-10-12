"""InspeTra AI — Main FastAPI Application Entry Point.

"See the problem. Investigate the cause. Act before failure."
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

import cv2
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine
from sqlalchemy import text
from pathlib import Path

# No DDL at import time. Tables come from `python3 -m scripts.bootstrap_db`,
# which runs the Alembic migrations in backend/alembic.

app = FastAPI(
    title=settings.app_name,
    description=(
        "Autonomous visual inspection platform using OpenCV 5 and agentic workflows. "
        "See the problem. Investigate the cause. Act before failure."
    ),
    version="1.0.0",
    docs_url="/docs" if settings.debug else "/api/docs",
    redoc_url="/redoc" if settings.debug else "/api/redoc",
    openapi_url="/openapi.json" if settings.debug else "/api/openapi.json",
)


# ---- CORS ----
# "*" and credentials cannot be combined: browsers reject the response, and
# allowing both would let any origin issue authenticated requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Static files (serves uploaded evidence/images) ----
upload_dir = Path("storage/uploads")
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=upload_dir), name="storage")


# ---- Middleware for request logging ----
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    return response


# ---- Health check ----
def _schema_revision() -> str:
    """Which migration the database is actually on, or why it is not usable."""
    try:
        with engine.connect() as conn:
            value = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()
        return str(value) if value else "no revision row"
    except Exception:
        # No alembic_version table: bootstrap_db has never been run here.
        return "migrations not applied"


@app.get("/health/live")
async def liveness_check():
    """Liveness only: the process is up and the event loop is answering.

    Deliberately touches nothing — no database, no OpenCV, no disk. The
    container HEALTHCHECK probes this endpoint because `/health` opens two fresh
    Postgres connections per call, and on a loaded host that is what makes a
    probe time out against an application that is working fine. A liveness probe
    that depends on a downstream service turns slow infrastructure into a
    restart loop.
    """
    return {"status": "alive"}


@app.get("/health")
async def health_check():
    """Simple health endpoint for load balancers and monitoring."""
    from app.database import check_db_connection

    db_ok = check_db_connection()
    return {
        "status": "healthy" if db_ok else "degraded",
        "app": settings.app_name,
        "version": "1.0.0",
        "opencv": cv2.__version__,
        "database": "connected" if db_ok else "disconnected",
        "schema_revision": _schema_revision(),
    }


# ---- API Routers ----
from app.api.auth import router as auth_router
from app.api.admin import router as admin_router
from app.api.equipment import router as equipment_router
from app.api.inspection import router as inspection_router
from app.api.finding import router as finding_router
from app.api.ticket import router as ticket_router
from app.api.agent import router as agent_router
from app.api.analytics import router as analytics_router
from app.api.vision import router as vision_router
from app.api.benchmark import router as benchmark_router
from app.api.system import router as system_router
from app.api.report import router as report_router
from app.api.translate import router as translate_router

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(equipment_router)
app.include_router(inspection_router)
app.include_router(finding_router)
app.include_router(ticket_router)
app.include_router(agent_router)
app.include_router(analytics_router)
app.include_router(vision_router)
app.include_router(benchmark_router)
app.include_router(system_router)
app.include_router(report_router)
app.include_router(translate_router)


# ---- Root ----
@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "description": "Autonomous Visual Inspection Platform",
        "tagline": "See the problem. Investigate the cause. Act before failure.",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "docs": "/api/docs",
            "auth_login": "/api/auth/login",
            "auth_register": "/api/auth/register",
            "equipment": "/api/equipment",
            "inspections": "/api/inspections",
            "findings": "/api/findings",
            "tickets": "/api/tickets",
            "agent": "/api/agent",
            "analytics": "/api/analytics",
            "vision": "/api/vision",
            "benchmarks": "/api/benchmarks",
        },
    }
