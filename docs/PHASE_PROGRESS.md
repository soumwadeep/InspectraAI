# Inspectra AI — Phase Progress

Statuses are only set from commands actually run on this machine. `BLOCKED` means
the check could not run here; it never means "probably fine".

| Phase | Objective | Status | Verified how |
| --- | --- | --- | --- |
| 0 | Make the existing app start and establish a tested baseline | **VERIFIED (partial)** | live HTTP calls against uvicorn on SQLite |
| 1 | Build green; remove every fabricated value | **VERIFIED** | `tsc` 0 errors, `eslint` 0 errors, `next build` 18/18 pages, full inspection driven in browser with 0 console errors |
| 2 | Vision Command OS design tokens + motion system | **VERIFIED** | browser computed styles confirm spec palette, Space Grotesk, grid/reticle layers, and dark↔light differing in colour and effect strength; `next build` green with unchanged 102 kB shared JS |
| 3 | Real OpenCV depth + genuine agentic loop | **IN PROGRESS** | SSIM and region classification done and verified over HTTP; agent loop rewrite pending |
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

## Environment facts this project depends on

- OpenCV: `5.0.0` (`opencv-python-headless 5.0.0.93`), `FFMPEG: YES`, **no**
  `cv2.quality` / `cv2.ximgproc` — anything relying on contrib modules will not
  resolve.
- Schema bootstrap: `cd backend && python3 -m scripts.bootstrap_db`
- API: `cd backend && python3 -m uvicorn app.main:app --port 8000`
- Frontend: `npm run dev` at repo root
