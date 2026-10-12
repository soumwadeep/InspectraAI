# INSPECTRA AI — PHASE COMPLETION REPORT

**Phase:** 4 — Seed real data, build the operator consoles
**Objective:** Give the app a database whose every number came from the real pipeline, then build
the four pages that read it — agent trace, benchmarks, analytics, reports — with no fabricated
value anywhere in the path from column to pixel.
**Status:** VERIFIED locally over HTTP and in the browser against SQLite. **PARTIALLY VERIFIED**
for Postgres (migration ran on the deployment host; no inspection has executed there). Infra
targets remain BLOCKED — see §7.
**Commits:** `f5ca0f2`…`021a18a` plus this phase's fixes.

Every figure below was read back from the running API, the database, or a scripted browser
session. No number in this report was typed by hand.

---

## 1. Demo data is produced by the same code path as a real inspection

`backend/scripts/seed_demo_data.py` no longer writes rows. It calls
`resolve_run_inputs()` + `execute_inspection_run()` from `app/services/inspection_run.py` —
the identical service `POST /api/inspections/{id}/run` uses — over generated captures built by
`app/vision/benchmark.py`. So a seeded dashboard cannot be structurally better than a real one,
because it is the same function.

Measured output of the run that produced this phase's screenshots (`--slug verify-console`):

```
inspections       18        findings         17
tickets           12        observations     71
evidence rows    102        video frames     12
avg measured run 261 ms     failed runs       0
categories  {discoloration: 7, dark_patch: 5, brightness_increase: 4, detail_loss: 1}
severities  {warning: 16, info: 1}
```

Ground truth is checked, not assumed: the seeder prints the injected categories per capture, and
each capture's findings are the pipeline's answer to them. Every clean capture produced **0**
regions — the false-positive class that Phase 3's fixture had manufactured.

## 2. Seeding found two product bugs that no test had found

| Bug | Why it was invisible before | Fix |
|---|---|---|
| `align_with_reference` never wrote the homography's validity mask | The single hand-driven Phase 3 capture happened to align with a full-frame overlap, so the zero-filled band was never scored | The mask is written as `aligned_<id>_mask.png` and `detect_visual_changes` erodes it by `mask_margin_px` before `bitwise_and` |
| The synthetic corpus built reference and capture with `warpAffine(BORDER_REPLICATE)` | The replicated edge band *looked like* a defect: whole-frame `new_texture`/`dark_patch` findings at up to 0.96 confidence on captures with nothing wrong with them | Both corpus and seeder now crop windows out of one oversized field, so borders never enter the diff |

Both were only visible once 18 captures ran back-to-back. Verified after the fix: 36 clean pairs
→ 0 false regions.

Fixing them **lowered the headline accuracy**, which is the honest direction. See §3.

## 3. The benchmark contradiction was a threshold, not a regression

The metrics workstream reported precision 0.4857 / recall 0.3778 against a documented 0.886 /
0.689. Re-measured both on the same corpus (32 pairs, seed 7):

| IoU threshold | precision | recall | F1 | mean IoU |
|---|---|---|---|---|
| **0.3** (baseline) | 0.8857 | 0.6889 | 0.7750 | 0.5721 |
| 0.5 | 0.4857 | 0.3778 | 0.4250 | 0.7323 |

Both are correct. Precision and recall are threshold-dependent, and the run form defaulted to
0.5, so a first user action appeared to disprove the published number. **The default is now 0.3**
so a first run reproduces the headline, and the results panel labels the threshold on screen —
which is what made this traceable instead of a silent contradiction.

Stored on the run row (`benchmark_runs.results_json`, read back for this report):

```
corpus          32 pairs, seed 7, 960x640, 45 ground-truth defects, 8 clean pairs
                pairs_with_false_positive_on_clean_input: 0
detection       31 TP · 4 FP · 14 FN
classification  31/31 correct category among matched localisations
timing          190 ms per pair
```

Recall loss is traced to one category: `detail_loss` — 13 present, 9 missed. It is a smoothed,
low-contrast change, and the difference detector keys on local contrast. That is stated in the
README rather than averaged away.

`GET /api/benchmarks/{id}` also silently disagreed with `GET /api/benchmarks`: the detail route
hand-built `config`/`results` while the list returned `config_json`/`results_json` through
`BenchmarkRunRead`. The client adapter therefore rendered every stored measurement empty on the
detail path. One resource, one schema now, with a test asserting the two key sets are equal and
that `pairs`/`seed`/`iou_threshold` survive — a metric without its threshold and seed is
unattributable.

## 4. The agent console is a transcript, not a summary

`app/dashboard/agent` + `components/agent/*` (12 files). It renders the persisted
`agent_steps` / `agent_tool_calls` / `evidence` rows for one run, interleaved exactly as the loop
wrote them, including pure state edges as thin connectors.

Live DOM evidence from a real paused run (`run=fed68553…`, driven through the UI):

```
01 analyze_image_quality   blur=0.4 exposure=0.12 glare=0.0% coverage=99.7%  suitability=insufficient
03 request_human_input     "Image quality is insufficient … (Laplacian variance 0.4 < 100.0; …)"
05 human_response           "Human answered 'retry' to: …"
06 analyze_image_quality    blur=0.4 …            ← the gate genuinely re-ran
11 align_with_reference     poor_quality, 120 keypoints, inlier ratio=5.0%, reprojection 0.97px
13 reanalyze                 Retry 1 of 2: capture upscaled 1.5x
19 align_with_reference     poor_quality, 93 keypoints, inlier ratio=6.5%, reprojection 0.68px (attempt 3)
21 request_human_input       "The capture could not be registered … (Low inlier ratio (6.45%) — viewpoint too different)"
```

Nothing above is generated by the UI. Each line is a row with its own `duration_ms`.

The `Recorded outcome` panel reads `agent_runs.final_outcome` verbatim
(`planner=deterministic-rule-v1`, `final_state=end`, `end_reached=true`, `iterations=7`,
`alignment_attempts=0`, `findings_created=1`, `timed_out=false`,
`overall_confidence=0.9963`) and prints **not returned** for any key the row does not carry —
`final_action`, `error`, `awaiting` on a clean completed run. The copy states that the planner is
a deterministic rule-based state machine; no wording implies a language model, because there is
no language model and no key.

Three defects found in review and fixed in this phase, each confirmed in the browser afterwards:

1. **`adaptAgentRunDetail` dropped `final_outcome`.** The route returned it, `lib/api.ts` declared
   it, the adapter never copied it onto `AgentRun`, so the panel would have shown "not returned"
   for a field that was on the wire. Now mapped on both the list and detail paths, and the list
   route emits it too so a row alone can fill the pane.
2. **`AgentStep["action"]` was declared `"started" | "completed" | "failed"`.** The column stores
   whatever ran (`align_with_reference`, `state_transition`, `human_response`). The type was a
   lie that call sites worked around with a `String()` cast; the union is now `string` and the
   cast helper is deleted.
3. **`app/dashboard/history` linked to `/dashboard/agent/{id}`**, a route that does not exist.
   The console selects a run by query parameter, so the link is now `?run={id}`.

Pause → resume is driven from the page itself, not just the API: `Send proceed` in the browser
moved the run from 4 to 17 persisted steps and produced the second question above.

**A fourth bug came from looking at the rendered page.** The console showed a run started 11 Oct
with tool calls stamped 12 Oct. The seeder's `_shift_times()` back-dated the run, steps and
observations but **not** `agent_tool_calls.started_at/completed_at`, while its own docstring
claimed "every timestamp moves by the same amount". Both statements cannot be true. The tool-call
rows are now shifted too.

## 5. Analytics and reports compute, and say what they computed from

`app/dashboard/analytics` renders, from `GET /api/analytics/overview` and the list endpoints:

```
INSPECTIONS RECORDED 18   EQUIPMENT MONITORED 8   FINDINGS AWAITING REVIEW 17
CONFIRMED FINDINGS   0    OPEN TICKETS          12   AVG DURATION 261 ms
```

`total_equipment` excludes archived rows — the count was previously mixing archived equipment into
a headline "monitored" figure.

Each panel is labelled with the endpoint that produced it **and its cap**, e.g. *"That endpoint
caps its list at 100 records and applies no ordering, so past 100 this is a sample rather than
the full history."* A page that silently aggregates a truncated list is a quieter kind of fake
data than a hardcoded number, so the caveat is in the UI, not only in the code.

`app/dashboard/reports` assembles `.txt` and `.json` in the browser from live rows. There is no
server-side report endpoint and no PDF writer, so neither is offered. Verified by instrumenting
`URL.createObjectURL` during a real click: a **1652-byte `text/plain;charset=utf-8`** blob was
produced from the fetched rows. Windowed output for last-30-days:

```
01 Inspections   18/18 rows · min 169 ms · median 256 ms · max 618 ms
02 Findings      17/17 · warning 16, info 1 · discoloration 7, dark_patch 5,
                 brightness_increase 4, detail_loss 1 · unverified 17, pending-review 17
03 Tickets       12/12 · awaiting-approval 12 · high 12 · overdue 0
04 Agent runs    18/18 · completed 18 · 108 iterations
```

`GET /api/system/capabilities` is introspected at runtime, and the overview page reads it. It
lists per-frame defect tracking, live camera input, an LLM planner and any real-world accuracy
claim as **not implemented**. One bug here was a lie in the opposite direction: `ffmpeg` reported
`False` on a build that decodes video, because the parser matched the literal `"FFMPEG: YES"`
against OpenCV's actual line, which pads the value with ~22 spaces. Parsing is now per-line with
a regex, and `FFMPEG: YES` is reported correctly.

## 6. Verification actually run for this phase

```
$ ./scripts/verify-local.sh
backend imports              PASS
pytest suite                 PASS      (54 tests)
frontend typecheck           PASS
frontend lint                PASS
clean-tree build (tracked files only) PASS
alembic head == db           PASS
RESULT: all local checks passed.
```

The `clean-tree build` check exists because of a mistake in this phase. I committed dashboard
pages importing `@/components/benchmarks/run-results`, `@/components/analytics/capabilities-panel`
and `@/components/benchmarks/benchmark-results` without ever staging those files. `tsc`, `lint` and
`next build` all read from disk, so everything passed **here**; Coolify clones the commit and failed
with three `Module not found` errors. The verifier now extracts `git archive HEAD` into a scratch
directory and builds *that*, so an unstaged import can never pass again.

Browser verification was run through the in-app browser, whose viewport was unavailable
(`window.innerWidth/innerHeight = 0`, `visibilityState = hidden`). Assertions that therefore did
run: page navigation and auth (real login, token in `localStorage`), rendered DOM text for every
panel above, the six evidence thumbnails resolving to real blobs —
**552489 / 3632 / 3651 bytes, `type: image/png`** — via the authenticated endpoint, one zero
console error, and a click on `Send proceed` that changed server state and refetched. Assertions
that could **not** run: anything about pixels — layout, animation timing, 3D layers, colour in the
compositor. `naturalWidth` stayed 0 because `loading="lazy"` never intersects a 0×0 viewport. The
Phase 2 visual verification (computed styles) still stands; this phase's visual pass does not.

## 7. BLOCKED, PARTIAL and honest limits after this phase

- **BLOCKED — Postgres data behaviour.** The migration now runs on the deployed Postgres 18
  (`Context impl PostgresqlImpl`, app reached "Application startup complete"), but **no inspection
  has executed on Postgres**. The `inspections ↔ agent_runs` FK cycle and `value_enum()`
  round-tripping have only been exercised on SQLite.
- **BLOCKED — deployment.** Two deployment bugs were fixed at the source (`postgres://` scheme,
  `PORT` vs hardcoded healthcheck) and one at the repo (untracked modules). The current frontend
  failure is a Coolify variable, not code: `NIXPACKS_NODE_VERSION=24` produces
  `error: undefined variable 'nodejs_24'` because Nixpacks v1.41.0 pins nixpkgs
  `ffeebf0acf3a…`, which has no `nodejs_24` attribute. `22` builds. Nothing is deployed yet.
- **BLOCKED — `Dockerfile.web` and `compose.yaml`.** Never built. The frontend deploys via
  Nixpacks detection, so that image is an unverified specification.
- **PARTIAL — benchmark scope.** Precision/recall describe a **labelled synthetic corpus of 32
  pairs** with a recorded seed. They are not accuracy on real plant imagery, and the README says
  so in the same breath as the numbers.
- **PARTIAL — `overall_confidence` is not a probability.** It is `1 − measured changed frame area`
  (0.9963 on the run above). The panel label states the formula; nothing calls it confidence in
  isolation.
- **PARTIAL — `final_action` is only written on failure, limit and abort paths.** A clean run
  leaves it NULL and the console prints "not returned". I did not invent a value for the success
  path, because `final_state=end` + `end_reached=true` already say what happened.
- **PARTIAL — blur still has two definitions** (frame sampler vs quality engine). Nothing presents
  a single canonical blur score.
- **NOT IMPLEMENTED — server-side report generation, PDF, live camera, per-frame defect tracking,
  LLM planner, AWS worker, S3 evidence, COOL.** No code, no credentials, no claims.
