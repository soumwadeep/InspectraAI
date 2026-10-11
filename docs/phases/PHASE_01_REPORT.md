# INSPECTRA AI — PHASE COMPLETION REPORT

**Phase:** 1 — Make the frontend compile and remove every fabricated value
**Objective:** No page may present an invented number, and the production build must succeed.
**Status:** VERIFIED
**Commit:** `inspectra-phase-1`

## Gate results (run on this machine)

```
npx tsc --noEmit   → exit 0            (was 18 errors)
npm run lint       → 0 errors, 40 warnings   (lint was inert before)
npm run build      → ✓ Compiled, 18/18 static pages generated
browser            → login → dashboard → inspection studio → real results, 0 console errors
```

## Bugs fixed

| Defect | File | Effect before |
| --- | --- | --- |
| TanStack Table v8 API misuse | `components/ui/data-table.tsx` | `getIsSorted()` compared to `"ascending"`/`"descending"` (never matched), `getPaginationRowModel().pageCount` and `table.state.pagination` do not exist → **Previous/Next were permanently disabled on every table**, header sorting had no handler |
| Pie chart fed the wrong shape | `app/dashboard/page.tsx:179` | `{category,count}` passed to a `{name,value}` component → Overview pie rendered empty |
| Wrong icon import + duplicate `className` | `app/dashboard/reports/page.tsx` | `TS2460`/`TS17001`; status dot colour lost |
| `unknown` used as an index type | `findings:100,109`, `tickets:85` | variant lookups untyped; a missing key silently renders `undefined` |
| Invalid Radix-shaped select shim | `components/ui/select.tsx` | `SelectTrigger = Select` nested `<select>` inside `<select>`, `SelectValue` returned `null` → the equipment picker could never work |
| `useState(2)` on step 1 | `app/dashboard/inspection/upload/page.tsx:34` | **the flagship page rendered an empty body on load** |
| `toCamel` on inspections | `lib/api.ts` | produced `startedAt`/`durationMs` while `Inspection` declares `startTime`/`duration` → history and equipment-detail tables rendered blank cells that looked like an empty database. Now an explicit `adaptInspection` |
| Milliseconds formatted as seconds | `history:93`, `equipment/[id]:139` | a 5,000 ms inspection displayed as "83m 20s" |
| `AgentRun["status"]` cast omitted `paused` | `agent/page.tsx:73` | a paused run (the human-in-the-loop state) rendered an undefined dot colour and unstyled badge |
| `logout()` left no token clearing… | `lib/api.ts` / `auth-context.tsx` | verified false alarm: `api.auth.logout()` already clears it. Checked rather than assumed |
| Reference images dropped in the adapter | `lib/api.ts:268` | hardcoded `referenceImages: []` while the API returns them → detail page always showed placeholder icons |
| `StorageService.UPLOAD_DIR` does not exist | `app/api/inspection.py:115,197` | **every inspection upload raised AttributeError → 500**, which the browser reported as "Failed to fetch". Found by driving the flow in a real browser, not by reading code |
| `metadata_json` assigned to a non-column | `app/api/equipment.py:178` | reference-image dimensions silently discarded; replaced with real `width`/`height` columns via a second migration |
| Upload size limit never enforced | `app/api/inspection.py` | `MAX_FILE_SIZE_BYTES` defined and unused; only the extension was checked → now returns 413 |
| ESLint config was an empty array | `eslint.config.js` | `next lint` printed "no warnings or errors" while checking nothing |

## Fabrications removed

- `lib/data.ts` — deleted (553 lines, imported by nothing, source of 7 type errors).
- **Overview:** "Detection Accuracy 94.2%"; System Health "Processing Queue 2 pending", "Agent Workers 3 active", hardcoded `OpenCV 5.0.0` → replaced by `components/mission/system-health-panel.tsx` reading `/health`.
- **Analytics:** four invented datasets (processing latency, review outcomes, false-positive rate, detection accuracy by category) and the 94.2% / 2.4s / 3.2% / 87.6% cards. Two replaced with real duration histograms and reviewer-decision counts; two **deleted**, because precision/recall and false-positive rate need a labelled ground-truth corpus that does not exist.
- **Benchmarks:** the COOL-vs-standard latency table, precision/recall/F1/FPR/FNR block, "AWS Graviton2 (Neoverse N1)" environment card and x86-64 comparison — all removed. `POST /api/benchmarks/run` hardcodes `"passed"` without opening an image, so **no Run benchmark button was added**.
- **Settings:** mock org/team/plan, five notification `Switch`es that persisted nothing, MFA and "2 active sessions", and "AWS S3 + EC2 — connected" (boto3 is not installed; `s3_key` columns are always NULL).
- **Reports:** `mockReports` with fake sizes and authors → real client-side CSV/JSON export of loaded records, with PDF explicitly marked not implemented.
- **Inspection studio:** `setTimeout(3000)` fake analysis and the hardcoded "Finding: Corrosion detected (87% confidence)" block → real calls to `/api/vision/quality` and `/api/vision/inspect`.
- **Live:** mock quality metrics, fake detection overlay, "Feed quality: Good · FPS: 30" → real `getUserMedia` capture sent to the OpenCV quality endpoint; FPS is now measured in-browser and labelled as such.
- Header badge `3` → real `pending_review` count, hidden at zero; inert search box removed rather than styled (returns with CommandHeader, wired to a real query).
- "14-day free trial. No credit card required." → there is no trial or billing.

## Verified in a real browser (not just compiled)

Driven through `next dev` + the API: login → dashboard shows 2 equipment / 0 everywhere else / "No runs yet" / "Queue depth: Not instrumented" / schema revision `9a5ae36e1d1a`. Then in the studio: select Turbine #1 → stored reference `panel.png` recognised → upload `warm_dark_rust.png` → Run.

Result: quality **sufficient** (blur 1529.0, exposure 0.257, glare 0.0119, coverage 0.997); alignment **success** (1612 matched keypoints, inlier ratio 0.999, reprojection error 0.00 px); change detection **1 region**, change fraction 0.0241, SSIM 0.9860; region classified **`discoloration`** at relative bbox `x 0.703 y 0.648 w 0.178 h 0.173`, severity warning, confidence 33%; server 298 ms / client 783 ms; six evidence PNGs rendered (annotated reference, region annotation, crop, comparison overlay, diff overlay, raw mask). Console: no errors.

This also confirms the Phase 0 SSIM and classification work is live behind the UI, and that the ORB-alignment risk flagged in Phase 0 is not a problem for the fixture design (1612 matched keypoints against a `min_matches` of 10).

## Known issues

1. **~9 dashboard subroutes 404 while being linked** (`equipment/new`, `equipment/{id}/edit`, `findings/{id}`, `tickets/new`, `tickets/{id}`, `agent/{id}`, `history/{id}`). Deliberately deferred to Phase 4, which builds them; `agent/new` will be cut rather than built (no `POST /api/agent/runs` exists — a run starts from an inspection).
2. **No route is auth-gated.** `middleware.ts` reads a cookie while the token lives in localStorage. Fix is the cookie-mirror + `AuthGate` in Phase 4.
3. 40 ESLint warnings remain (mostly `no-explicit-any`, unused imports, `img` element usage). Rules are at `warn` so the build is not blocked; promote to `error` when the count is zero.
4. Every router path is declared as `/` under a prefix, so `/api/equipment` answers `307` before working. Browsers follow it; it doubles requests and should be normalised.
5. A handful of dead `<Button>`s likely remain on equipment and row-action surfaces; the regex sweep was inconclusive. Phase 2 rewrites the chrome, so they are handled there rather than patched twice.
6. `docs/` claims about Docker, Postgres, Redis, AWS remain `BLOCKED` — not installed here.

## Next phase

Phase 2 — the Vision Command OS design system: CSS-variable tokens with the specified palette, Space Grotesk + JetBrains Mono, and one shared motion system with real reduced-motion support.
