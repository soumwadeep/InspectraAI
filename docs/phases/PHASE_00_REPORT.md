# INSPECTRA AI — PHASE COMPLETION REPORT

**Phase:** 0 — Complete audit and baseline recovery
**Objective:** Make the existing application reliably start, and document and test what actually works.
**Status:** VERIFIED (partial) — the application starts and its core API now answers correctly; the inspection-to-ticket workflow is not exercised end-to-end until Phase 3.
**Commit:** `inspectra-phase-0`

## What was broken

The application had **never run end-to-end**. Two independent blockers, both verified
by direct execution rather than by reading code:

1. `backend/app/main.py` called `Base.metadata.create_all()` at line 21, while the
   model modules are imported at line 82. `app/database.py` does not import models,
   so `Base.metadata` was empty and the call created **zero tables**. Confirmed:
   `backend/inspectra.db` was 0 bytes with a `sqlite_master` table count of 0.
2. `passlib==1.7.4` reads `bcrypt.__about__` to detect its backend. `bcrypt` 5.0.0
   removed that attribute, so passlib's own bug probe raised and
   `hash_password()` failed with `ValueError: password cannot be longer than 72
   bytes`. Every `/api/auth/register` and `/api/auth/login` call was a 500. Raw
   `bcrypt.hashpw` on the same machine succeeds, which isolates the fault to passlib.

With no tables and no login, every other endpoint was unreachable in practice, which
is why the frontend is full of hardcoded placeholders.

## Bugs fixed

| Fix | File | Why it mattered |
| --- | --- | --- |
| Direct `bcrypt` hashing, no passlib | `app/core/security.py` | login/register were 500 |
| `bcrypt>=4.2,<6` pinned, `passlib` removed | `requirements.txt` | a clean install reproduced the failure |
| `opencv-python-headless` pinned to `==5.0.0.93` | `requirements.txt` | `>=5.0.0` is unresolvable elsewhere |
| DDL removed from import; Alembic baseline added | `app/main.py`, `alembic/`, `scripts/bootstrap_db.py` | `alembic.ini` pointed at a directory that did not exist |
| First registrant of a new organization becomes administrator; `OrganizationMember` row written | `app/api/auth.py` | approvals require `administrator`, but registration only ever produced `inspector` — the approval step was unreachable. `organization_members` was a dead table |
| Slug uniqueness on registration | `app/api/auth.py` | two orgs with the same name hit the UNIQUE constraint and returned 500 |
| Password byte-length validated | `app/schemas/auth.py` | bcrypt truncates past 72 bytes silently |
| Enums persist their **value** (`value_enum`) | `app/database.py` + all models | SQLAlchemy stores the member *name*; these enums use hyphenated values, so the DB held `pending_review` while every API response said `pending-review` |
| SQLite `PRAGMA foreign_keys=ON` | `app/database.py` | FK enforcement was off, so a row with a bogus `organization_id` saved fine and then vanished from every org-scoped query |
| `inspections.agent_run_id` → `use_alter=True` | `app/models/inspection.py` | Postgres would fail on the `inspections` ↔ `agent_runs` cycle |
| Ambiguous join given an explicit onclause | `app/api/analytics.py` | with two FK paths between the tables, `join(Inspection)` raised `AmbiguousForeignKeysError` |
| `avg_processing_ms` reads `Inspection.duration_ms` | `app/api/analytics.py` | queried `InspectionJob.duration_ms`, which does not exist → the dashboard's only data call 500'd |
| `system_health` read from the process | `app/api/analytics.py` | returned hardcoded `database: True, opencv: True, redis: False` |
| `ChangedRegion.category` added | `app/vision/change_detection.py` | `engine.py` and `evidence.py` read it, so **any** detected change raised `AttributeError` |
| `decode_image` uses `IMREAD_COLOR` | `app/vision/preprocessing.py` | `IMREAD_UNCHANGED` returned 4-channel BGRA for alpha PNGs; the later `cvtColor` raised → ordinary screenshots 500'd |
| `db.flush()` before reading `ticket.id` | `app/api/ticket.py` | `autoflush=False` meant the id was still `None` → NOT NULL violation on every ticket create |
| Equipment archive returns no body for 204 | `app/api/equipment.py` | 204 with a body is a malformed response |
| Equipment `last_inspection` computed | `app/api/equipment.py` | was hardcoded `None` |
| Enum comparisons use members | `app/api/analytics.py`, `app/api/equipment.py` | string comparisons against the old name-stored enums matched nothing |
| CORS origins from config, no wildcard-with-credentials | `app/main.py`, `app/config.py` | `allow_origins=["*"]` + `allow_credentials=True`, with `DEBUG=true` shipped in `.env` |
| `/api/admin/init-db` and `/api/admin/seed` replaced by `/api/admin/schema-status` | `app/api/admin.py` | both required an admin token that could only exist after they ran |
| `Mapped[str]` JSON columns default to `dict` | models | they defaulted to the **string** `"{}"`, so `run.final_outcome["x"] = …` was a TypeError |
| `AgentRun.budget_used` Integer → Float, `context_json` added | `app/models/agent.py` | tool costs are fractional (2.5, 3.0) and were truncated; `context_json` is what makes real resume possible |
| Missing models exported from `models/__init__.py` | `app/models/__init__.py` | an unregistered model gets no table |

## Verified by actual calls (uvicorn + SQLite, no Docker)

```
GET  /health                 → {"status":"healthy","opencv":"5.0.0",
                                "database":"connected","schema_revision":"9a5ae36e1d1a"}
POST /api/auth/register      → 201, role "administrator"
POST /api/auth/login         → 200
GET  /api/auth/me            → 200
POST /api/equipment          → 201 (and 307 → same route with trailing slash)
GET  /api/analytics/overview → 200  (previously 500 AttributeError)
POST /api/vision/quality     → 200, blur_score 6.99 < 100 →
                              "insufficient: Image is blurry (Laplacian variance 7.0)"
POST /api/vision/inspect     → 200  (previously AttributeError whenever a change was found)
                              alignment 314 keypoints, reprojection error 0.553,
                              36 regions, 4 evidence categories, 717 ms
python3 -m scripts.bootstrap_db --status → current == head
PRAGMA foreign_keys via app engine → 1
```

## What genuinely works already (keep it)

The OpenCV signal-processing core is real and correctly written: Laplacian blur,
HSV specular-glare fraction, threshold+contour coverage, Canny edge density,
CLAHE/bilateral/morphology preprocessing, ORB + `findHomography(RANSAC)` with
inlier ratio and reprojection error, `warpPerspective` with a valid-region mask,
absdiff→threshold→morphology→contours for change detection, and evidence rendering
(`COLORMAP_JET` heatmaps, annotated/cropped/comparison PNGs). `/health` reports
`cv2.__version__` = `5.0.0`, so the competition's OpenCV 5 claim is true.

## Still broken / not implemented

- `agent/workflow.py` — uncapped `while True` with three non-terminating cycles;
  `AgentState.END` unreachable, so every inspection is marked `failed`;
  `_persist_run` violates `agent_steps.description NOT NULL` and re-inserts the
  whole log; `organization_id`/`requester_id` hardcoded to `""`; findings returned
  with `"evidence": []`. → Phase 3.
- `vision/change_detection.py:compute_ssim` — calls `cv2.quality_QualitySSIM_create`,
  which does not exist in this build; a bare `except` falls back to
  `matchTemplate(TM_CCOEFF_NORMED)` and returns that as `ssim_score`. Every SSIM
  number currently served is mislabeled normalized cross-correlation. → Phase 3.
- `api/benchmark.py` — hardcodes `results["quality_test"] = "passed"` without
  processing an image. → Phase 3.
- No video decoding despite `.mp4` being accepted. → Phase 3.
- No LLM (by decision: the planner stays deterministic and is labelled as such).
- Frontend does not compile: 18 `tsc` errors. → Phase 1.

## Fixture design constraint discovered

The two panels used to verify `/api/vision/inspect` were generated with independent
Gaussian noise draws. The differ treated that noise as change and reported **36
regions for a single injected defect**. Demo and test fixtures must therefore share
one deterministic base image and differ **only** by the injected defect, or the
product will appear to produce dozens of false positives in a live demo.

## Next phase

Phase 1 — make `tsc` and `next build` pass, delete `lib/data.ts`, and remove every
fabricated number and dead control from the dashboard.
