"""System capabilities: what this deployment can actually do, measured at runtime.

The UI needs to state honestly which features are real, which are configured but
unreachable, and which do not exist. Every value below is introspected from the
running process — the OpenCV build string, the SQLAlchemy dialect, the presence of
optional settings — rather than maintained as a list that goes stale.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/api/system", tags=["system"])

# Feature names the product surface may reference. `implemented` means code exists
# and runs; `available` means it works in *this* deployment. Neither is inferred
# from a wish list.
FEATURES = (
    ("image_inspection", True, "quality gate, ORB registration, absdiff+SSIM, evidence, findings"),
    ("video_frame_sampling", True, "cv2.VideoCapture decode, measured per-frame statistics, sharpest-frame selection"),
    ("per_frame_defect_tracking", False, "defects are detected on one decoded frame; no trajectory across frames exists"),
    ("live_camera_input", False, "no webcam capture path is implemented; the UI must not imply one"),
    ("agentic_state_machine", True, "bounded deterministic planner with pause/resume"),
    ("language_model_planner", False, "the planner is rule-based over measured values; planner id is recorded per run"),
    ("benchmark_metrics", True, "precision/recall/F1/IoU over a labelled synthetic corpus"),
    ("real_world_accuracy_claim", False, "benchmark numbers describe the synthetic corpus only"),
)


@router.get("/capabilities", response_model=dict)
async def capabilities() -> dict:
    """Report runtime capability: what is real here and what is not."""
    import cv2
    from sqlalchemy import inspect as sa_inspect

    from app.database import engine

    build_info = cv2.getBuildInformation()

    def built_with(flag: str) -> bool:
        """Read `<flag>: YES` out of the build report.

        The padding is variable — the real line is
        `    FFMPEG:                      YES` — so matching on a fixed number of
        spaces reported ffmpeg as absent on a build that demonstrably encodes and
        decodes video. Parse the line instead of guessing its spacing.
        """
        import re

        pattern = rf"^\s*{re.escape(flag)}:\s*(YES|NO)\b"
        match = re.search(pattern, build_info, re.MULTILINE | re.IGNORECASE)
        return bool(match) and match.group(1).upper() == "YES"

    contrib_available = hasattr(cv2, "ximgproc") or hasattr(cv2, "quality")

    dialect = engine.dialect.name
    try:
        tables = set(sa_inspect(engine).get_table_names())
    except Exception:
        tables = set()

    return {
        "opencv": {
            "version": cv2.__version__,
            "ffmpeg": built_with("FFMPEG"),
            "gstreamer": built_with("GStreamer"),
            "contrib_available": contrib_available,
            "note": (
                "contrib absent means cv2.quality and cv2.ximgproc do not exist; "
                "SSIM is implemented locally in app/vision/ssim.py"
                if not contrib_available
                else "contrib modules present"
            ),
        },
        "database": {
            "dialect": dialect,
            "tables_present": len(tables),
            # Postgres is the deployment target; SQLite is the development engine.
            "postgres_verified": dialect == "postgresql",
        },
        "integrations": {
            "redis_configured": bool(settings.redis_url),
            "s3_configured": bool(settings.s3_bucket and settings.aws_access_key_id),
            "aws_worker": False,
            "cool_integration": False,
        },
        "queue": {
            "instrumented": False,
            "note": "processing is synchronous and in-process; there is no queue to report depth for",
        },
        "features": [
            {"name": name, "implemented": implemented, "detail": detail}
            for name, implemented, detail in FEATURES
        ],
    }
