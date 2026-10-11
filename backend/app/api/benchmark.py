"""Benchmark endpoints: run benchmark, list runs, get results."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.models.benchmark import BenchmarkRun
from app.schemas.benchmark import BenchmarkRunRead, BenchmarkRunSchema
from sqlalchemy.orm import Session
import json

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


@router.get("", response_model=list[BenchmarkRunRead])
async def list_benchmarks(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """List benchmark runs for the current organization."""
    runs = db.query(BenchmarkRun).filter(
        BenchmarkRun.organization_id == org_id
    ).order_by(BenchmarkRun.created_at.desc()).all()
    return runs


@router.post("/run", response_model=BenchmarkRunRead)
async def run_benchmark(
    config: BenchmarkRunSchema,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Score the vision pipeline over a generated labelled corpus.

    This used to import four vision classes, call none of them, and store
    `{"quality_test": "passed", ...}`. The numbers now come from real pixels:
    see `app/vision/benchmark.run_benchmark`.
    """
    import time

    from app.vision.benchmark import run_benchmark as measure

    settings = config.config or {}
    started = time.time()
    results = measure(
        pair_count=int(settings.get("pairs", 12)),
        seed=int(settings.get("seed", 7)),
        iou_threshold=float(settings.get("iou_threshold", 0.3)),
    )
    results["corpus"]["wall_ms"] = int((time.time() - started) * 1000)

    run = BenchmarkRun(
        organization_id=org_id,
        name=config.name,
        description=config.description,
        config_json=config.config,
        results_json=results,
        duration_ms=int((time.time() - started) * 1000),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/{run_id}", response_model=dict)
async def get_benchmark(
    run_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Get a specific benchmark run with full results."""
    run = db.query(BenchmarkRun).filter(
        BenchmarkRun.id == run_id,
        BenchmarkRun.organization_id == org_id,
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Benchmark run not found")

    return {
        "id": run.id,
        "name": run.name,
        "description": run.description,
        "config": run.config_json,
        "results": run.results_json,
        "duration_ms": run.duration_ms,
        "created_at": run.created_at.isoformat(),
    }
