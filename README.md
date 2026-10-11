# Inspectra AI

**Vision Command OS** — computer-vision industrial inspection with an agentic
review loop. Point a camera at a machine part, and Inspectra registers the
capture against a reference image, measures what changed, classifies the
change, produces evidence, files a finding, raises a maintenance ticket, and
asks a human when the pixels do not support a confident answer.

Built for the **OpenCV 5 + AWS Competition 2026**.

> **Read this first: what is real here.** Every claim below is tied to a run
> that actually happened on a developer machine, and everything that has *not*
> been run is labelled **BLOCKED** rather than quietly implied. No metric in
> this project is hardcoded, no agent decision is simulated, and no deployment
> is reported as successful without a command that proves it. The status ledger
> is [`docs/PHASE_PROGRESS.md`](docs/PHASE_PROGRESS.md); the per-phase evidence
> is in [`docs/phases/`](docs/phases/).

---

## Run it locally

No Docker, Postgres or Redis required. Python 3.13 and Node 22 were used.

```bash
# 1. Backend
cd backend
python3 -m pip install -r requirements.txt
python3 -m scripts.bootstrap_db          # creates/migrates the schema via Alembic

python3 -m uvicorn app.main:app --port 8000

# 2. Frontend (repo root, second terminal)
npm install
npm run dev
```

Then open **http://localhost:3000** and register an organization at `/register`.
The first registrant in a database becomes the `administrator`. There are no
seeded credentials to look up, on purpose.

⚠️ **Use `localhost`, not `127.0.0.1`.** The API allowlists `http://localhost:3000`
— the `cors_origins` default in `backend/app/config.py`, overridable with a
comma-separated `CORS_ORIGINS` env var. Browsers treat `http://127.0.0.1:3000` as
a *different* origin, so requests get no `access-control-allow-origin` back and
the login form reports *"Could not reach the API"* while the API is perfectly
healthy. Set `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` if you
want both spellings to work.

Confirm the stack is alive:

```bash
curl -s http://localhost:8000/health
# {"status":"healthy","opencv":"5.0.0","database":"connected","schema_revision":"3f1c7d2a8b44"}
```

`schema_revision` is read from Alembic, not hardcoded, so it tells you whether the
database you are talking to is the one you migrated.

### Requirements

| | |
|---|---|
| Frontend | Next.js 15.5.27, React 19.3.0, TypeScript, Tailwind 3.4.19, framer-motion 11.18.2, TanStack Query 5, Recharts 2.15 |
| Backend | FastAPI 0.115.6, SQLAlchemy 2.0.36, Alembic 1.13.3, pydantic v2 |
| Vision | **OpenCV 5.0.0** (`opencv-python-headless 5.0.0.93`), NumPy 2.5.3, Python 3.13 |

OpenCV contrib is **not** installed, so `cv2.quality` and `cv2.ximgproc` do not
exist here. The SSIM implementation in `backend/app/vision/ssim.py` is a local
Wang et al. implementation for exactly that reason.

---

## What the pipeline actually does

```
capture ─▶ quality gate ─▶ ORB + RANSAC homography ─▶ absdiff → threshold
        → morphology → contours ─▶ SSIM + region stats ─▶ heuristic
        classifier ─▶ evidence artefacts ─▶ finding ─▶ ticket
```

- **Quality gate** — Laplacian-variance sharpness, exposure distribution, glare
  fraction, frame coverage, each compared against thresholds in
  `backend/app/vision/quality.py`.
- **Registration** — ORB features, BF matching, `findHomography(RANSAC)`, then a
  reprojection-error and inlier-ratio check. A registration that does not hold up
  is rejected rather than used.
- **Change detection** — difference image → threshold → morphological cleanup →
  external contours, with SSIM computed over the same pair. Regions carry
  relative 0–1 bboxes, so overlays are resolution-independent.
- **Classification** — measured heuristics over the contour mask (not the bbox):
  delta brightness, delta saturation, warm-hue fraction, edge-density change.
  Categories it can emit: `discoloration`, `dark_patch`, `brightness_increase`,
  `detail_loss`, `new_texture`, `visual_change`.
- **Evidence** — annotated reference, per-region crop, per-region annotated crop,
  side-by-side comparison, diff overlay, raw binary mask.

### The agent loop is deterministic, and says so

There is **no large language model** in this loop. `VisionAgent` is a bounded
state machine (`backend/app/agent/state_machine.py`) whose next action is chosen
by rules reading the measurements the vision layer just produced
(`backend/app/agent/workflow.py::_next_action`). Every run records
`planner: "deterministic-rule-v1"` in its `final_outcome`, so a trace can never be
mistaken for model reasoning. It is bounded three ways — iteration cap, wall-clock
cap, and a repeat guard on `(state, action)` pairs — and it terminates in
`completed`, `failed` or `paused`.

`paused` is a real state: the run stops, persists its context, and
`POST /api/agent/runs/{id}/resume` with `retry`, `proceed` or `abort` continues it
from the stored snapshot.

---

## Measured results

These are outputs of the pipeline, produced by
`POST /api/benchmarks/run {"pairs": 8, "seed": 7, "iou_threshold": 0.3}` and
stored in `benchmark_runs.results_json` with the seed that reproduces them.

| Metric | Value |
|---|---|
| Precision | **0.90** |
| Recall | **1.00** |
| F1 | **0.9474** |
| Mean IoU (matched) | **0.641** |
| Category accuracy on matched regions | **9/9** |
| True / false positives / false negatives | 9 / 1 / 0 |
| Pipeline time | 2 216 ms over 8 pairs (277 ms/pair) |

**Scope of that number, stated precisely:** it measures
`backend/app/vision/benchmark.py`'s **labelled synthetic corpus** — a
deterministic generated panel (hatch grid, bolt circle, vent plate) with defects
injected at known coordinates, each capture shifted ±14 px so registration has
real work to do, and every fourth pair deliberately clean so false positives are
scored. It is **not** accuracy on real plant imagery and must not be quoted as
such. The response keeps each pair's ground-truth boxes and raw predictions so
the aggregate can be audited; the one false positive is reported, not removed.

### Traces captured over HTTP (Phase 3)

Same image → same trace; different image → a genuinely different path.

| Input | Measured | What the loop did | Outcome |
|---|---|---|---|
| Panel with rust patch | 1 612 keypoints, 99.9% inliers, SSIM 0.986, 2.41% changed | detect → evidence → finding → ticket | `completed`, 1 finding, `high` ticket |
| Capture identical to reference | SSIM **1.000**, 0 regions | finalize once, no evidence pass | `completed`, 0 findings, no ticket |
| Blurred + under-exposed | blur **2.5** (limit 100), exposure **0.05** | asked for a retake | `paused` → `awaiting_evidence` |
| Unrelated texture | inlier ratio **1.3% → 1.3% → 1.1%** | retried registration twice, then asked | `paused` |
| Paused run, resumed `retry` with a good capture | re-measured blur 1529, 99.9% inliers | re-ran the full chain | `completed`, 1 finding + ticket |
| Paused run, resumed `proceed` on the bad capture | 136 keypoints, **2.9%** inliers | retried, then asked again | `paused` — it did not invent a finding |

The last row is the behaviour that matters most: an override from a human does not
manufacture confidence the pixels do not support.

### Video

`backend/app/vision/video.py` decodes with `cv2.VideoCapture`, samples up to 12
evenly spaced frames, writes each as PNG, and measures every one (Laplacian
variance, mean absolute difference and SSIM against the reference). The **sharpest
measured frame** is the one the agent analyses; every sampled frame is persisted
as an `inspection_frames` row with its true index and timestamp.

Verified on a generated 48-frame fixture: `12 frames decoded from 24.0 fps
960x640; analysed frame 17 — highest measured Laplacian variance (1577.78 over 12
sampled frames)`.

**This is frame sampling with measured selection plus per-frame statistics. It is
not per-frame defect tracking** — defects are detected on one decoded frame
against the reference, and no per-frame defect trajectory is claimed anywhere.

---

## API surface

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Equipment | `GET`/`POST /api/equipment`, `GET`/`PATCH`/`DELETE /api/equipment/{id}`, `POST /api/equipment/{id}/reference-image`, `GET /api/equipment/{id}/status` |
| Inspections | `GET`/`POST /api/inspections`, `POST /api/inspections/{id}/upload`, `POST /api/inspections/{id}/run`, `GET /api/inspections/{id}`, `GET /api/inspections/{id}/input/{input_id}/preview` |
| Findings | `GET /api/findings`, `GET`/`PATCH /api/findings/{id}`, `POST /api/findings/{id}/review`, `GET /api/findings/{id}/evidence/{evidence_id}` |
| Tickets | `GET`/`POST /api/tickets`, `GET`/`PATCH /api/tickets/{id}`, `POST /api/tickets/{id}/approve`, `POST /api/tickets/{id}/verify` |
| Agent | `GET /api/agent/runs`, `GET /api/agent/runs/{id}`, `POST /api/agent/runs/{id}/resume` |
| Vision | `POST /api/vision/quality`, `POST /api/vision/align`, `POST /api/vision/compare`, `POST /api/vision/inspect` |
| Analytics | `GET /api/analytics/overview` |
| Benchmarks | `GET /api/benchmarks`, `POST /api/benchmarks/run`, `GET /api/benchmarks/{id}` |
| Ops | `GET /health`, `GET /api/admin/schema-status`, `GET /api/admin/health` |

Findings and tickets are created by the agent run, not by a client `POST` — which
is why there is no create route for findings.

Every dashboard number is read from these endpoints and derived from database
rows — nothing is rendered from a constant. Where a subsystem is not wired up the
UI says so: the health panel literally reports `Queue depth: Not instrumented`
and `Redis: Not configured`.

---

## Repository layout

```
app/                  Next.js App Router pages (dashboard, login, register)
components/          UI + vision viewport (canvas overlays, measured geometry)
lib/                 API client, motion presets, viewport geometry
backend/app/api/      FastAPI routers
backend/app/agent/    state machine, deterministic planner, tools
backend/app/vision/   quality, alignment, change detection, SSIM,
                      classification, evidence, metrics, video, benchmark
backend/app/models/   SQLAlchemy models (22 tables)
backend/alembic/      migrations (0001 baseline, 0002, 0003)
backend/scripts/      bootstrap_db — the only supported way to create a schema
docs/phases/          PHASE_00…03 reports, with evidence per claim
```

Schema changes go through Alembic only. `Base.metadata.create_all()` was removed
from app startup: it ran before the models were imported, so it created nothing
while appearing to work.

```bash
npm run typecheck      # tsc --noEmit
npm run lint
npm run build
cd backend && python3 -m alembic upgrade head
```

---

## Status: verified, blocked, and known weak

### VERIFIED (locally, over HTTP, against SQLite)

- One inspection running end to end: quality → registration → detection →
  evidence → finding → ticket → `end`.
- Six evidence artefacts per finding, each fetched back over the API and
  byte-checked as a real PNG.
- Pause and resume, including a resume from a video-derived frame.
- Video decoding, measured frame selection, `inspection_frames` persistence.
- Real precision/recall/F1/IoU from the labelled corpus.
- 14 read endpoints returning 200 with database-derived content.
- Theming and motion in the browser: spec palette, self-hosted Space Grotesk,
  dark↔light differing in colour *and* effect strength, three separate
  reduced-motion gates.

### BLOCKED — not because the code is missing, but because it could not be run here

- **Postgres.** Everything above ran on SQLite. The native-enum labels and the
  `inspections` ↔ `agent_runs` foreign-key cycle are untested on Postgres.
- **Docker.** Not installed on this machine. `backend/Dockerfile` is written and
  is known-broken (it chowns `/workspace`, a directory it never creates); it has
  not been built, so it is not claimed to work.
- **AWS, S3 evidence storage, Bedrock/Rekognition, Graviton worker.** No code, no
  credentials, no ARM host.
- **COOL.** The competition's deployment target. Not integrated and not claimed.
- **Coolify deployment.** `inspectra.actizant.com` exists as configuration
  intent; no release has been pushed from here.
- **CI.** No `gh` CLI and no SSH key on this machine; pushes go out over HTTPS.

### Known weak (recorded rather than smoothed over)

- Blur is computed two different ways — the video sampler measures the resized
  grayscale frame, the quality engine runs it through its own preprocessing
  chain — and the numbers differ (1577.78 vs 1398.5 on the same stored PNG).
  Nothing should present a single canonical blur score until they are reconciled.
- `mp4v` round-trip noise produces extra low-confidence `info` regions on
  compression-heavy video. The agent correctly raises no ticket for them.
- `GET /api/agent/runs` is N+1 (four queries per run).
- `inspection_frames` is write-only until a frame-read endpoint exists.
- No committed test suite yet — Phase 3 verification was driven by throwaway
  HTTP scripts. That is the first thing Phase 5 fixes.
- `input_type = "live"` exists in a request schema and nothing reads it. There is
  no webcam path, and the UI does not claim one.

---

## Competition context

Entered in the **OpenCV 5 + AWS Competition 2026**. The OpenCV 5 work is real and
running: 5.0.0, no contrib, with the SSIM and metric implementations written
locally because the contrib modules are absent. The AWS half is **BLOCKED** — no
credentials, no host, nothing deployed — and is presented as such rather than as
a screenshot.

## License

See [LICENSE](LICENSE).
