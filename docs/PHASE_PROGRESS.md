# Inspectra AI — Phase Progress

Statuses are only set from commands actually run on this machine. `BLOCKED` means
the check could not run here; it never means "probably fine".

| Phase | Objective | Status | Verified how |
| --- | --- | --- | --- |
| 0 | Make the existing app start and establish a tested baseline | **VERIFIED (partial)** | live HTTP calls against uvicorn on SQLite |
| 1 | Build green; remove every fabricated value | **VERIFIED** | `tsc` 0 errors, `eslint` 0 errors, `next build` 18/18 pages, full inspection driven in browser with 0 console errors |
| 2 | Vision Command OS design tokens + motion system | **VERIFIED** | browser computed styles confirm spec palette, Space Grotesk, grid/reticle layers, and dark↔light differing in colour and effect strength; `next build` green with unchanged 102 kB shared JS |
| 3 | Real OpenCV depth + genuine agentic loop | **VERIFIED (local, SQLite)** | five distinct agent traces driven over HTTP (defect, clean, poor-quality, weak-alignment, human-override) plus pause→resume; 14 read endpoints 200; 6 evidence PNGs fetched back and byte-checked; real video decode (48-frame fixture, 12 frames sampled, sharpest selected by measured Laplacian variance); benchmark endpoint now computes precision 0.9 / recall 1.0 / F1 0.9474 / mean IoU 0.641 on a labelled 8-pair corpus instead of storing `"passed"`. See `docs/phases/PHASE_03_REPORT.md` |
| 4 | Seed real data; build console + VisionViewport | pending | browser, evidence PNGs decoded from disk |
| 5 | Verification harness, containers, deploy docs, security | pending | `verify-local.sh`; Docker/Postgres/AWS **BLOCKED** (not installed) |

## Known BLOCKED items (machine has no Docker, Postgres, Redis or AWS access)

- Postgres migration path: the baseline is generated and applied against SQLite
  only. The native-enum labels and the `inspections` ↔ `agent_runs` foreign-key
  cycle are untested on Postgres.
- Docker image builds (`backend/Dockerfile` is known-broken: it chowns
  `/workspace`, a directory that is never created).
- `compose.yaml` / `compose.coolify.yml` — do not exist yet, cannot be validated.
- AWS vision worker, S3 evidence storage, COOL benchmarks — no code, no
  credentials, no ARM host.

## Honest limits established in Phase 3 (do not let the UI overstate these)

- Video support is **frame sampling with measured selection plus per-frame
  statistics**. Defects are detected on one decoded frame. There is no per-frame
  defect tracking and no `input_type = "live"` code path.
- `inspection_frames` rows are write-only until Phase 4 adds a read/streaming
  endpoint.
- The benchmark's precision/recall describe a **labelled synthetic corpus of 8
  pairs** with a recorded seed. They are not accuracy on real plant imagery.
- `mp4v` round-trip noise produces extra low-confidence `info` regions on
  compression-heavy video; the agent raises no ticket for them.
- Blur is computed two different ways (frame sampler vs quality engine) and the
  numbers differ; nothing should present a single canonical blur score.
- `GET /api/agent/runs` is N+1 (four queries per run).

## Environment facts this project depends on

- OpenCV: `5.0.0` (`opencv-python-headless 5.0.0.93`), `FFMPEG: YES`, **no**
  `cv2.quality` / `cv2.ximgproc` — anything relying on contrib modules will not
  resolve.
- Schema bootstrap: `cd backend && python3 -m scripts.bootstrap_db`
- API: `cd backend && python3 -m uvicorn app.main:app --port 8000`
- Frontend: `npm run dev` at repo root
