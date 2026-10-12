# Inspectra AI — Phase Progress

Statuses are only set from commands actually run on this machine. `BLOCKED` means
the check could not run here; it never means "probably fine".

| Phase | Objective | Status | Verified how |
| --- | --- | --- | --- |
| 0 | Make the existing app start and establish a tested baseline | **VERIFIED (partial)** | live HTTP calls against uvicorn on SQLite |
| 1 | Build green; remove every fabricated value | **VERIFIED** | `tsc` 0 errors, `eslint` 0 errors, `next build` 18/18 pages, full inspection driven in browser with 0 console errors |
| 2 | Vision Command OS design tokens + motion system | **VERIFIED** | browser computed styles confirm spec palette, Space Grotesk, grid/reticle layers, and dark↔light differing in colour and effect strength; `next build` green with unchanged 102 kB shared JS |
| 3 | Real OpenCV depth + genuine agentic loop | **VERIFIED (local, SQLite)** | five distinct agent traces driven over HTTP (defect, clean, poor-quality, weak-alignment, human-override) plus pause→resume; 14 read endpoints 200; 6 evidence PNGs fetched back and byte-checked; real video decode (48-frame fixture, 12 frames sampled, sharpest selected by measured Laplacian variance); benchmark endpoint now computes precision 0.9 / recall 1.0 / F1 0.9474 / mean IoU 0.641 on a labelled 8-pair corpus instead of storing `"passed"`. See `docs/phases/PHASE_03_REPORT.md` |
| 4 | Seed real data; build console + VisionViewport | **IN PROGRESS** | Seeding **VERIFIED**: 18 inspections driven through the real pipeline, findings matching injected ground truth per category, 0 false regions on all clean captures. Two real bugs found *by* seeding (alignment never wrote its `_mask.png`; warp-seam margin) and fixed. Frame + capability APIs **VERIFIED**. Console pages in flight |
| 5 | Verification harness, containers, deploy docs, security | **PARTIALLY VERIFIED** | 50-test pytest suite passes; `verify-local.sh` green; path traversal, tenant isolation and ticket transitions **VERIFIED by test**. Dockerfiles and compose authored but **BLOCKED** — no Docker on this machine, so never built |

> **Benchmark numbers were revised downward in Phase 4.** Phase 3 recorded
> precision 0.90 / recall 1.00 / F1 0.9474 / mean IoU 0.641 over 8 pairs. That
> corpus used `warpAffine(BORDER_REPLICATE)`, which manufactured an edge band the
> detector reported as a whole-frame defect on defect-free captures, and the agent
> path was running with no alignment validity mask at all. Fixing the fixture and
> the mask also fixed a real false-positive source — and lowered the score. The
> current measured baseline is **precision 0.886 / recall 0.689 / F1 0.775 / mean
> IoU 0.572 over 32 pairs**, with the recall loss traced to one category
> (`detail_loss`, 13 present / 9 missed). See `docs/phases/PHASE_03_REPORT.md` for
> what was measured then and the Phase 4 report for what it became.

## Phase 4 additions, verified

- `GET /api/inspections/{id}/frames` and `.../frames/{frame_id}/image` —
  `inspection_frames` was write-only. Now readable with per-frame measured
  blur/SSIM/difference, plus the frame the agent selected and the measured reason.
- `GET /api/system/capabilities` — introspected at runtime (OpenCV build flags,
  SQLAlchemy dialect, table count, configured integrations), and lists per-frame
  defect tracking, live camera, LLM planner and any real-world accuracy claim as
  **not implemented**.
- `GET /api/agent/runs` N+1 removed: measured 5 SQL statements for 19 runs,
  previously ~77.
- Path traversal closed in `StorageService`; seven escape payloads rejected while
  real stored files still read.
- Tenant isolation enforced on the input-preview and frames routes.
- Ticket status transitions guarded; `closed` is terminal; an unknown status
  string returns 400 instead of escaping as a 500.
- Deployment fix: the client no longer bakes an absolute API host. It uses a
  relative `/backend-api` base that Next proxies from `BACKEND_ORIGIN` at request
  time, so CORS is not a deployment requirement and one build works everywhere.

## Known BLOCKED items (machine has no Docker, Postgres, Redis or AWS access)

- Postgres migration path: the baseline is generated and applied against SQLite
  only. The native-enum labels and the `inspections` ↔ `agent_runs` foreign-key
  cycle are untested on Postgres.
- Docker image builds: `backend/Dockerfile` was rewritten (it chowned a
  `/workspace` directory that nothing created, and omitted `alembic/` so no
  migration could run in the container) and `Dockerfile.web` was added — but
  **neither has ever been built**, because Docker is not installed here. Treat
  both as unverified specifications, not working artifacts.
- `compose.yaml` — same status: authored, never brought up.
- AWS vision worker, S3 evidence storage, COOL benchmarks — no code, no
  credentials, no ARM host.

## Honest limits established in Phase 3 (do not let the UI overstate these)

- Video support is **frame sampling with measured selection plus per-frame
  statistics**. Defects are detected on one decoded frame. There is no per-frame
  defect tracking and no `input_type = "live"` code path.
- ~~`inspection_frames` rows are write-only~~ — resolved in Phase 4:
  `GET /api/inspections/{id}/frames` and a per-frame image route now exist.
- The benchmark's precision/recall describe a **labelled synthetic corpus of 8
  pairs** with a recorded seed. They are not accuracy on real plant imagery.
- `mp4v` round-trip noise produces extra low-confidence `info` regions on
  compression-heavy video; the agent raises no ticket for them.
- Blur is computed two different ways (frame sampler vs quality engine) and the
  numbers differ; nothing should present a single canonical blur score.
- ~~`GET /api/agent/runs` is N+1~~ — resolved in Phase 4: batched to 5 statements
  for 19 runs (was ~77).

## Environment facts this project depends on

- OpenCV: `5.0.0` (`opencv-python-headless 5.0.0.93`), `FFMPEG: YES`, **no**
  `cv2.quality` / `cv2.ximgproc` — anything relying on contrib modules will not
  resolve.
- Schema bootstrap: `cd backend && python3 -m scripts.bootstrap_db`
- API: `cd backend && python3 -m uvicorn app.main:app --port 8000`
- Frontend: `npm run dev` at repo root
