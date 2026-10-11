"""Seed a demo workspace by running the REAL pipeline over generated captures.

    cd backend && python3 -m scripts.seed_demo_data

Every finding, severity, confidence, ticket and metric this produces is an output
of `app.vision` and `app.agent`, reached through the same `resolve_run_inputs` +
`execute_inspection_run` path that `POST /api/inspections/{id}/run` uses. Nothing
is inserted by hand. The only thing chosen rather than measured is *when* a run is
stamped, so the dashboard's 30-day trend has something to plot; durations and
scores stay exactly as the pipeline reported them.

The workspace is a separate organization, so existing rows are never modified and
nothing is deleted. Re-running is refused unless the slug is free.
"""
from __future__ import annotations

import argparse
import secrets
import sys
from datetime import datetime, timedelta

import cv2
import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agent.state_machine import AgentState
from app.core.security import hash_password
from app.core.storage import UPLOAD_DIR
from app.database import SessionLocal, enable_sqlite_foreign_keys
from app.models.agent import AgentRun, AgentStep
from app.models.equipment import Equipment, EquipmentReferenceImage
from app.models.finding import Finding, FindingEvidence
from app.models.inspection import (
    Inspection,
    InspectionFrame,
    InspectionInput,
    VisionObservation,
)
from app.models.ticket import MaintenanceTicket
from app.models.user import Organization, OrganizationMember, RoleEnum, User
from app.services.inspection_run import (
    InspectionRunError,
    execute_inspection_run,
    resolve_run_inputs,
)
from app.vision.benchmark import HEIGHT, WIDTH, draw_panel, inject_defect

ASSETS = [
    ("Turbine housing — line A", "turbine", "Plant Floor A", "Kawasaki", "KST-300", "SN-8801"),
    ("Air compressor B2", "compressor", "Plant Floor B", "Atlas Copco", "GA-37", "SN-4412"),
    ("Heat exchanger HX-1", "heat_exchanger", "Yard North", "Alfa Laval", "T20", "SN-7130"),
    ("Conveyor drive unit", "conveyor", "Plant Floor C", "Siemens", "1LA9", "SN-2265"),
    ("Hydraulic press P4", "press", "Bay 4", "Bosch Rexroth", "CRRB", "SN-9903"),
    ("Transformer bushing T3", "transformer", "Substation", "ABB", "TU-440", "SN-1177"),
    ("Pump skid S1", "pump", "Yard South", "Grundfos", "NK-80", "SN-6021"),
    ("Weld seam jig W9", "weld_jig", "Fabrication", "Fanuc", "R-2000", "SN-3348"),
]

# (asset index, defect categories, or None for a clean capture, days ago)
SCHEDULE = [
    (0, ["discoloration"], 1),
    (0, ["dark_patch", "discoloration"], 4),
    (0, None, 9),
    (1, ["brightness_increase"], 2),
    (1, ["detail_loss"], 6),
    (1, None, 13),
    (2, ["discoloration", "detail_loss"], 3),
    (2, ["dark_patch"], 8),
    (3, ["brightness_increase", "discoloration"], 5),
    (3, None, 11),
    (4, ["detail_loss", "dark_patch"], 7),
    (5, ["discoloration"], 10),
    (5, ["dark_patch", "brightness_increase"], 15),
    (6, ["discoloration", "detail_loss", "dark_patch"], 12),
    (6, None, 18),
    (7, ["brightness_increase"], 16),
    (7, ["detail_loss"], 20),
]

# One asset also gets a real mp4, so the frame-sampling path is exercised too.
VIDEO_ASSET_INDEX = 2
VIDEO_DAYS_AGO = 2


PAD = 40


def _asset_field(field_seed: int) -> np.ndarray:
    """The oversized panel an asset's whole demo is cropped from.

    Reference and every capture for that asset are windows of this one draw, so
    the only difference between them is framing plus the injected defect.
    """
    return draw_panel(
        np.random.default_rng(field_seed), size=(WIDTH + PAD, HEIGHT + PAD)
    )


def _window(field: np.ndarray, tx: int, ty: int) -> np.ndarray:
    """A WIDTH x HEIGHT window offset from the asset's framing centre."""
    origin = PAD // 2
    return field[origin + ty:origin + ty + HEIGHT, origin + tx:origin + tx + WIDTH].copy()


def _reference_window(field: np.ndarray) -> np.ndarray:
    return _window(field, 0, 0)


def _panel_pair(seed: int, shift: tuple[int, int]):
    """Reference and capture as two windows onto one continuous field.

    The first version used `warpAffine(..., BORDER_REPLICATE)`, which copies the
    edge column of the panel down the shifted side. The detector read that
    replicated band as a change and returned a whole-frame region — a clean
    capture produced a `dark_patch` finding at 0.96 confidence on a frame with no
    defect in it. Cropping a padded draw instead models a real retake: the framing
    moves, the field continues, and nothing artificial enters the frame.
    """
    field = _asset_field(seed)
    return _reference_window(field), _window(field, *shift)


def _file(relative_path: str):
    return UPLOAD_DIR / relative_path.removeprefix("uploads/")


def _write(relative_dir: str, name: str, image: np.ndarray) -> str:
    directory = UPLOAD_DIR / relative_dir
    directory.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(directory / name), image)
    return f"uploads/{relative_dir}/{name}"


def _shift_times(db: Session, inspection: Inspection, delta: timedelta) -> None:
    """Move a run's rows back in time by `delta`, preserving measured durations.

    Every timestamp moves by the same amount, so ordering within a run and the
    recorded wall-clock duration stay truthful; only the calendar position changes.

    This iterates ORM instances on purpose. A bulk `update({...: Column - delta})`
    makes SQLite do *day* arithmetic on the stored value and wrote the integer 42
    into `started_at`, which then raised `str_to_datetime: argument must be str` on
    every read of the analytics endpoint.
    """
    if inspection.started_at is not None:
        inspection.started_at -= delta
    if inspection.ended_at is not None:
        inspection.ended_at -= delta

    run_id = inspection.agent_run_id
    if run_id:
        for run in db.query(AgentRun).filter(AgentRun.id == run_id):
            if run.started_at is not None:
                run.started_at -= delta
            if run.ended_at is not None:
                run.ended_at -= delta
        for step in db.query(AgentStep).filter(AgentStep.run_id == run_id):
            if step.timestamp is not None:
                step.timestamp -= delta
        for obs in db.query(VisionObservation).filter(
            VisionObservation.agent_run_id == run_id
        ):
            if obs.created_at is not None:
                obs.created_at -= delta
        # inspection_frames.timestamp_ms is relative to its own video, so it is
        # deliberately not shifted with the calendar.

    findings = list(db.query(Finding).filter(Finding.inspection_id == inspection.id))
    for finding in findings:
        if finding.created_at is not None:
            finding.created_at -= delta
        if finding.updated_at is not None:
            finding.updated_at -= delta
    finding_ids = [finding.id for finding in findings]
    if not finding_ids:
        return

    for evidence in db.query(FindingEvidence).filter(
        FindingEvidence.finding_id.in_(finding_ids)
    ):
        if evidence.created_at is not None:
            evidence.created_at -= delta
    for ticket in db.query(MaintenanceTicket).filter(
        MaintenanceTicket.finding_id.in_(finding_ids)
    ):
        if ticket.created_at is not None:
            ticket.created_at -= delta
        if ticket.updated_at is not None:
            ticket.updated_at -= delta
        if ticket.due_date is not None:
            ticket.due_date -= delta


def _run_and_record(
    db: Session,
    *,
    inspection: Inspection,
    org_id: str,
    user_id: str,
    asset_name: str,
    label: str,
    days_ago: int,
    tally: dict[str, int],
) -> None:
    """Execute through the service, then persist the outcome and its date shift."""
    tally["inspections"] += 1

    try:
        inputs = resolve_run_inputs(db, inspection)
    except InspectionRunError as error:
        tally["failed"] += 1
        print(f"  {asset_name} [{label}]: cannot run — {error}")
        return

    try:
        ctx, failure = execute_inspection_run(
            db, inspection=inspection, org_id=org_id, user_id=user_id, inputs=inputs
        )
    except Exception as error:  # one bad capture must not abort the workspace
        tally["failed"] += 1
        print(f"  {asset_name} [{label}]: raised {type(error).__name__}: {error}")
        return

    if failure:
        tally["failed"] += 1
        print(f"  {asset_name} [{label}]: FAILED — {failure}")
        return

    tally["findings"] += len(ctx.findings)
    if ctx.current_state is AgentState.HUMAN_WAIT:
        tally["paused"] += 1

    _shift_times(db, inspection, timedelta(days=days_ago))
    db.commit()

    print(
        f"  {asset_name} [{label}] -> {ctx.current_state.value}, "
        f"{len(ctx.findings)} finding(s), {ctx.iterations} tool calls, "
        f"{inspection.duration_ms} ms"
    )


def _seed_image_inspection(
    db: Session, *, asset: Equipment, field: np.ndarray, inspector_id: str, org_id: str,
    categories: list[str] | None, days_ago: int, seed: int, tally: dict,
) -> None:
    rng = np.random.default_rng(seed)
    shift = (int(rng.integers(-12, 13)), int(rng.integers(-12, 13)))
    capture = _window(field, *shift)

    for category in categories or []:
        radius = int(rng.integers(28, 50))
        cx = int(rng.integers(radius + 70, WIDTH - radius - 70))
        cy = int(rng.integers(radius + 70, HEIGHT - radius - 70))
        inject_defect(rng, category, capture, cx, cy, radius)

    inspection = Inspection(
        equipment_id=asset.id, organization_id=org_id, inspector_id=inspector_id,
    )
    db.add(inspection)
    db.flush()

    relative = _write(f"inspections/{inspection.id}", "capture.png", capture)
    stored = _file(relative)
    db.add(InspectionInput(
        inspection_id=inspection.id,
        input_type="image",
        filename="capture.png",
        storage_path=relative,
        file_size_bytes=stored.stat().st_size,
        metadata_json={"seeded": True, "ground_truth": categories or []},
    ))
    db.commit()

    _run_and_record(
        db, inspection=inspection, org_id=org_id, user_id=inspector_id,
        asset_name=asset.name,
        label=", ".join(categories) if categories else "clean",
        days_ago=days_ago, tally=tally,
    )


def _seed_video_inspection(
    db: Session, *, asset: Equipment, field: np.ndarray, inspector_id: str, org_id: str,
    seed: int, tally: dict,
) -> None:
    """Write a genuine mp4 so decoding, sampling and selection all execute."""
    reference = _reference_window(field)
    rng = np.random.default_rng(seed + 7)
    defect = reference.copy()
    inject_defect(rng, "discoloration", defect, WIDTH // 2 + 120, HEIGHT // 2 + 60, 42)

    inspection = Inspection(
        equipment_id=asset.id, organization_id=org_id, inspector_id=inspector_id,
    )
    db.add(inspection)
    db.flush()

    directory = UPLOAD_DIR / f"inspections/{inspection.id}"
    directory.mkdir(parents=True, exist_ok=True)
    video = directory / "walk-round.mp4"
    writer = cv2.VideoWriter(
        str(video), cv2.VideoWriter_fourcc(*"mp4v"), 24.0, (WIDTH, HEIGHT)
    )
    if not writer.isOpened():
        writer.release()
        db.delete(inspection)
        db.commit()
        print("  video: no mp4 encoder available in this OpenCV build, skipped")
        return

    # Every third frame is blurred so "analyse the sharpest sampled frame" has to
    # choose by measurement rather than by position.
    for index in range(48):
        frame = defect if index >= 24 else reference
        if index % 3 == 0:
            frame = cv2.GaussianBlur(frame, (0, 0), 4)
        writer.write(frame)
    writer.release()

    relative = f"uploads/inspections/{inspection.id}/walk-round.mp4"
    db.add(InspectionInput(
        inspection_id=inspection.id,
        input_type="video",
        filename="walk-round.mp4",
        storage_path=relative,
        file_size_bytes=video.stat().st_size,
        metadata_json={"seeded": True, "ground_truth": ["discoloration (frames 24+)"]},
    ))
    db.commit()

    _run_and_record(
        db, inspection=inspection, org_id=org_id, user_id=inspector_id,
        asset_name=asset.name, label="video walk-round",
        days_ago=VIDEO_DAYS_AGO, tally=tally,
    )


def seed(slug: str, org_name: str, base_seed: int) -> int:
    db = SessionLocal()
    enable_sqlite_foreign_keys(db.get_bind())

    if db.query(Organization).filter(Organization.slug == slug).first():
        print(
            f"Organization '{slug}' already exists. Nothing was written.\n"
            "Choose another --slug; this script never deletes or overwrites.",
            file=sys.stderr,
        )
        db.close()
        return 1

    org = Organization(name=org_name, slug=slug)
    db.add(org)
    db.flush()

    passwords = {
        RoleEnum.administrator: secrets.token_urlsafe(9),
        RoleEnum.inspector: secrets.token_urlsafe(9),
    }
    users = {}
    for role, email, display_name in (
        (RoleEnum.administrator, f"manager@{slug}.example", "Plant Manager"),
        (RoleEnum.inspector, f"inspector@{slug}.example", "Field Inspector"),
    ):
        user = User(
            email=email,
            name=display_name,
            role=role,
            organization_id=org.id,
            hashed_password=hash_password(passwords[role]),
        )
        db.add(user)
        db.flush()
        db.add(OrganizationMember(
            organization_id=org.id, user_id=user.id, role=role,
        ))
        users[role] = user
    db.commit()

    equipment: dict[int, Equipment] = {}
    for index, spec in enumerate(ASSETS):
        name, category, location, maker, model, serial = spec
        asset = Equipment(
            organization_id=org.id,
            name=name,
            category=category,
            location=location,
            manufacturer=maker,
            model=model,
            serial_number=serial,
            description=f"Synthetic asset {index + 1} of the seeded demo workspace.",
            inspection_schedule="Weekly",
            assigned_inspector_id=users[RoleEnum.inspector].id,
            installation_date=datetime.utcnow() - timedelta(days=365 * (index + 1)),
        )
        db.add(asset)
        equipment[index] = asset
    db.flush()

    fields = {index: _asset_field(base_seed + index * 101) for index in equipment}

    for index, asset in equipment.items():
        relative = _write(
            f"reference/{asset.id}", "reference.png", _reference_window(fields[index])
        )
        db.add(EquipmentReferenceImage(
            equipment_id=asset.id,
            filename="reference.png",
            storage_path=relative,
            width=WIDTH,
            height=HEIGHT,
        ))
    db.commit()

    print(f"Seeding {len(ASSETS)} assets and {len(SCHEDULE)} captures through the "
          f"real pipeline (seed {base_seed})…")

    tally = {"inspections": 0, "findings": 0, "failed": 0, "paused": 0}
    inspector_id = users[RoleEnum.inspector].id

    for asset_index, categories, days_ago in SCHEDULE:
        _seed_image_inspection(
            db, asset=equipment[asset_index], field=fields[asset_index],
            inspector_id=inspector_id, org_id=org.id,
            categories=categories, days_ago=days_ago,
            seed=base_seed + asset_index * 101 + (len(categories or []) * 17),
            tally=tally,
        )

    _seed_video_inspection(
        db, asset=equipment[VIDEO_ASSET_INDEX], field=fields[VIDEO_ASSET_INDEX],
        inspector_id=inspector_id, org_id=org.id, seed=base_seed + 900, tally=tally,
    )

    _report(db, org, slug, passwords, users, tally)
    db.close()
    return 0


def _report(db, org, slug, passwords, users, tally) -> None:
    org_id = org.id
    findings = db.query(Finding).filter(Finding.organization_id == org_id).count()
    tickets = db.query(MaintenanceTicket).filter(
        MaintenanceTicket.organization_id == org_id
    ).count()
    observations = (
        db.query(VisionObservation)
        .join(Inspection, Inspection.id == VisionObservation.inspection_id)
        .filter(Inspection.organization_id == org_id)
        .count()
    )
    evidence = (
        db.query(FindingEvidence)
        .join(Finding, Finding.id == FindingEvidence.finding_id)
        .filter(Finding.organization_id == org_id)
        .count()
    )
    frames = (
        db.query(func.count(InspectionFrame.id))
        .join(Inspection, Inspection.id == InspectionFrame.inspection_id)
        .filter(Inspection.organization_id == org_id)
        .scalar()
    )
    categories = dict(
        db.query(Finding.category, func.count(Finding.id))
        .filter(Finding.organization_id == org_id)
        .group_by(Finding.category).all()
    )
    severities = {
        (s.value if hasattr(s, "value") else s): n
        for s, n in db.query(Finding.severity, func.count(Finding.id))
        .filter(Finding.organization_id == org_id)
        .group_by(Finding.severity).all()
    }
    avg_ms = db.query(func.avg(Inspection.duration_ms)).filter(
        Inspection.organization_id == org_id, Inspection.duration_ms > 0
    ).scalar()

    print("\nSeeded workspace, read back from the database:")
    print(f"  organization      {org.name}  (slug {slug})")
    print(f"  inspections       {tally['inspections']}")
    print(f"  findings          {findings}   categories {categories}")
    print(f"  severities        {severities}")
    print(f"  tickets           {tickets}")
    print(f"  observations      {observations}")
    print(f"  evidence rows     {evidence}")
    print(f"  video frames      {frames}")
    print(f"  avg measured run  {float(avg_ms or 0):.0f} ms")
    print(f"  failed runs       {tally['failed']}    paused runs: {tally['paused']}")
    print("\nSign in at http://localhost:3000/login (passwords generated now, shown once):")
    for role, user in users.items():
        print(f"  {user.email}  /  {passwords[role]}   ({role.value})")
    print("No credential is written to the repository.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed a demo workspace through the real pipeline.")
    parser.add_argument("--slug", default="demo-plant")
    parser.add_argument("--org-name", default="Demo Plant A (synthetic)")
    parser.add_argument("--seed", type=int, default=20261026)
    args = parser.parse_args()
    return seed(args.slug, args.org_name, args.seed)


if __name__ == "__main__":
    raise SystemExit(main())
