# INSPECTRA AI — PHASE COMPLETION REPORT

**Phase:** 3 — Real OpenCV depth and the agentic loop
**Objective:** Make one inspection run end-to-end through real measurement — quality gate, ORB registration, change detection, evidence, finding, ticket, pause and resume — and delete the remaining hardcoded claims.
**Status:** VERIFIED (locally, over HTTP, against SQLite). Infra targets remain BLOCKED — see the last section.
**Commit:** `inspectra-phase-3`

Everything below was produced by driving the running API (`uvicorn` on 127.0.0.1:8000) with
scripts in `/tmp/inspectra_e2e.py`, `/tmp/inspectra_smoke.py`, `/tmp/inspectra_branches.py` and
`/tmp/inspectra_video.py`, then reading the database rows back. No number in this report was
typed by hand.

---

## 1. The agent loop now completes, and says why

One `POST /api/inspections/{id}/run` with a defect capture produced HTTP 200 and this trace,
written to `agent_steps` / `agent_tool_calls`:

| # | Action | Measured result |
|---|--------|-----------------|
| 1 | analyze_image_quality | blur=1529.0, exposure=0.26, glare=1.2%, coverage=99.7%, suitability=sufficient |
| 3 | align_with_reference | success, 1612 keypoints, inlier ratio=99.9%, reprojection error=0.00px |
| 5 | detect_visual_changes | detected, 1 region, SSIM=0.986, mean diff=0.8, change fraction=2.41% |
| 7 | generate_evidence | 6 artifacts |
| 9 | create_finding | 1 finding (discoloration, confidence 0.3293, severity warning) |
| 11 | create_maintenance_ticket | ticket `priority=high`, status `awaiting-approval` |
| 13 | finalize_inspection | summary with real totals |
| 14 | state_transition | `completed → end` |

`run.status = completed`, `iterations = 7`, `budget_used = 12.0`, `duration_ms = 1101`,
`final_outcome = {planner: "deterministic-rule-v1", final_state: "end", end_reached: true,
findings_created: 1, alignment_attempts: 0, timed_out: false, ticket_id: …}`.

The finding carries the measurements that produced it
(`delta_brightness 15.37`, `delta_saturation 143.28`, `warm_hue_fraction 1.0` against a
`reference_warm_hue_fraction 0.273`, edge density 0.0516 → 0.0083) and six evidence rows, every
one of which was fetched back over HTTP and checked as a real PNG
(`evidence/annotated_reference` 1 291 104 B, `annotated` 40 598 B, `cropped` 41 521 B,
`comparison` 2 553 213 B, `diff_overlay` 1 125 852 B, `diff_mask_raw` 3 726 B — all `png=True`).

**Planner honesty:** `PLANNER_ID = "deterministic-rule-v1"` is written into every run's
`final_outcome`, and every branch in `_next_action` reads a number the vision layer measured.
There is no language model in this loop and nothing in the copy claims there is.

## 2. Adaptive branches, each verified as a different trace

| Scenario | What the measurements forced | Outcome |
|---|---|---|
| Clean capture (= reference) | SSIM **1.000**, 0 regions, change fraction 0.00% | `finalize` once → END, 0 findings, no ticket, inspection `completed` |
| Blurred + under-exposed retake | blur **2.5** (< 100), exposure **0.05** | `request_human_input` → run `paused`, inspection `awaiting_evidence` |
| Unrelated texture | inlier ratio **1.3% → 1.3% → 1.1%** across three registrations | retried twice, then `request_human_input` → `paused` |
| Paused run resumed with `retry` and a good capture | blur 1529, inlier 99.9% | re-measured quality → 1 finding + ticket → `completed` |
| Paused run resumed with `proceed` on the bad capture | 136 keypoints, inlier **2.9%** | aligned, retried twice, paused again asking for a retake — it did not invent a finding |

Same image → same trace; different image → different trace. That is the claim, and the five rows
above are the evidence for it.

## 3. Bugs found by running it, and what each one was really doing

- **`ValueError: Tool 'create_finding' received undeclared argument(s): ctx`** — the schema
  validator I added treated the empty schema of context-consuming tools as a contract. Undeclared
  keys are now checked only for `model_callable` tools; internal steps receive the live context.
- **`_execute_tool() got multiple values for argument 'ctx'`** — the context was being threaded
  through `**kwargs`, which is also what gets JSON-persisted as the step's `arguments`. Context
  tools are now dispatched by `CONTEXT_TOOLS` and the trace records what they actually saw
  (`workflow_state`, `regions`, `findings`, `alignment_attempts`).
- **Run status written in the wrong vocabulary.** The terminal branch passed
  `ctx.current_state.value` ("end") into an `AgentRunStatus` column, so the row read back as
  `KeyError: 'end'` and **every** inspection-detail and agent-run request 500'd. `_run_status_for`
  now maps state → status, `_finish_run` rejects an out-of-vocabulary status at the write, and the
  one poisoned dev row (created by this bug minutes earlier) was corrected to `completed`. No
  schema reset, no other rows touched.
- **`InspectionRead.findings` was `list[str]` against a relationship of ORM objects** — the run
  endpoint 500'd on response serialization as soon as a finding existed. A `mode="before"`
  validator now emits ids, which is what `lib/api.ts` already typed.
- **Three endpoints returned `obj.__dict__`**, which carries `_sa_instance_state`:
  `/api/agent/runs`, `/api/inspections/{id}` and `/api/tickets/{id}`. All 500'd *only when data
  existed*, which is how they survived review. Replaced with `FindingRead`,
  `AgentStepRead`/`AgentToolCallRead`, and new `TicketEventRead`/`ApprovalRequestRead` schemas.
- **Evidence files were named twice** (`annotated_annotated_reference.png`) and six artifacts on
  disk collapsed into three database rows, because `setdefault` folded the diff overlay and the
  annotated reference into one "comparison". `_evidence_for_region` now maps every filename to a
  distinct type and all six are attached and servable; `evidence_type` vocabulary is documented on
  the model.
- **`finalize_inspection` ran twice on a clean capture** — FINDING→finalize→REPORTING and
  REPORTING→finalize→END. `finalize_inspection` is terminal from every state now.
- **The retry budget was unreachable.** The loop guard counted `(ANALYSIS, align)` repeats and
  tripped on the third alignment before the "ask the human" branch could run, so a weakly-aligned
  capture was reported `failed`. `MAX_ALIGNMENT_RETRIES = 2` and `MAX_ACTION_REPEATS = retries + 1`
  tie the guard to the budget it was blocking.
- **A paused run stayed `running` forever** — the `needs_human` exit returned without flushing
  steps or finishing the run, so `POST /runs/{id}/resume` answered *"Run is
  AgentRunStatus.running, not paused"* and the pause was unresumable. It now persists and reports
  `paused`.
- **Resuming inherited stale counters.** `action_counts`, `iterations`, `budget_used` and the step
  numbering survived in the snapshot, so the first post-resume action tripped the repeat guard and
  the new steps were numbered 1, 3, 5 again next to identical numbers. Retry clears the counters and
  step numbering continues from the rows already in the database (visible above as steps 6…18).
- **`retry` skipped the quality gate.** It resumed into ANALYSIS, so the new capture was aligned
  and measured without ever being checked — no `quality` row was recorded. `retry` now returns to
  START, and the resumed run above re-measured blur and exposure before proceeding.
- **`proceed` had no meaning.** It mapped to DETECTION, which read an empty alignment and
  re-analysed the rejected capture. It now records the human override
  (`inspection_suitability = "accepted_by_human"`) and starts at alignment.
- **Metric rows were attributed to the wrong capture.** `vision_observations` had no run link, so
  a paused run's measurements of the rejected image were the only ones on file and a re-run was
  silently skipped by a count guard. Migration `3f1c7d2a8b44` adds
  `vision_observations.agent_run_id` (+ index + FK), every writer populates it, the guard is
  per-run, and metric rows are only recorded at a terminal state — never for a pause.
- **`/api/benchmarks/run` fabricated its results.** It imported four vision classes, called none
  of them and stored `{"quality_test": "passed", …}`. That is the single most damaging kind of
  fake in a competition entry. It is replaced (section 5).
- **`calculate_precision_recall` could never score anything.** Ground truth was labelled
  `"ground_truth"` while predictions carried defect categories, and the matcher required the
  categories to be equal — so every prediction was a false positive and every target a false
  negative, permanently. Matching now has a `require_category_match` flag, and label correctness is
  reported separately as `category_correct`/`category_total`.

## 4. Video is no longer a dead end

The upload endpoint accepted `.mp4/.mov/.avi/.webm`, and the run path fed that file straight to
`cv2.imread`, which returns `None` — the run failed with *"Failed to load image"* about a file the
API had just congratulated itself on storing.

`app/vision/video.py` decodes with `cv2.VideoCapture`, samples up to 12 evenly spaced frames,
writes each as PNG, and measures every one: Laplacian variance, mean absolute difference against
the reference, and SSIM. The **sharpest measured frame** becomes the frame the agent analyses;
every sampled frame is persisted as an `inspection_frames` row with its true index and timestamp.

Verified against a generated 48-frame fixture:

```
container reports: 48 frames @ 24.0 fps 960x640
[1] sample_video_frames -> Decoded 12 sampled frame(s) from 24.0 fps 960x640;
    analysed frame 17 - highest measured Laplacian variance (1577.78 over 12 sampled frames)
inspection_frames rows: 12   (0,0) (4,167ms) (9,375ms) (13,542ms) (17,708ms) …
final_outcome.video_sampling = {frames_requested: 12, frames_decoded: 12,
    container_frame_count: 48, fps: 24.0, width: 960, height: 640,
    selected_frame_index: 17, …}
```

Frame 17 is genuinely one of the sharp frames — the fixture deliberately blurs every third one, and
the selection is made from measured variance, not from a position guess.

**Scope stated plainly:** this is *frame sampling with measured selection plus per-frame
statistics*, not per-frame defect tracking. Defect detection runs on one decoded frame against the
reference; the other frames contribute real temporal statistics that are stored and chartable.
Per-frame defect trajectories are not implemented and are not claimed anywhere in the UI.

## 5. Real benchmark numbers

`app/vision/benchmark.py` generates a labelled synthetic corpus: a deterministic base panel
(hatch grid, bolt circle, vent plate) shared by each reference/capture pair, shifted by a random
±14 px translation so registration has real work to do, with injected defects whose positions are
known exactly. Every fourth pair is **clean**, so false positives are scored rather than hidden.
Ground truth is expressed in reference coordinates and in the same relative 0–1 convention the
detector reports.

`POST /api/benchmarks/run {"pairs": 8, "seed": 7, "iou_threshold": 0.3}` returned, in 8 983 ms,
persisted to `benchmark_runs.results_json`:

```
corpus        {pairs: 8, seed: 7, resolution: [960, 640], ground_truth_defects: 9,
               clean_pairs: 2, pairs_with_false_positive_on_clean_input: 0,
               geometric_offset_range_px: 14, iou_threshold: 0.3}
detection     {true_positives: 9, false_positives: 1, false_negatives: 0,
               precision: 0.9, recall: 1.0, f1_score: 0.9474, mean_iou: 0.641}
classification{correct: 9, scored: 9, accuracy: 1.0}
timing        {pipeline_ms: 2216, per_pair_ms: 277.0}
```

`per_pair` keeps every pair's ground-truth boxes, raw predictions, SSIM and mean difference, so the
aggregate can be audited pair by pair. The one false positive (a `dark_patch` on a rust pair) is
reported, not suppressed. These numbers describe **this 8-pair synthetic corpus** and nothing else;
they must never be quoted as accuracy on real plant imagery, and the API response carries the seed
and corpus description precisely so the claim can't drift.

## 6. Regression sweep

14 read endpoints, exercised after every fix — all 200, none of them returning an empty stub:

`/api/auth/me` · `/api/equipment` · `/api/equipment/{id}` · `/api/equipment/{id}/status`
(`/open_findings` = 1, read from the findings table) · `/api/findings` · `/api/inspections` ·
`/api/inspections/{id}` · `/api/agent/runs` · `/api/agent/runs/{id}` · `/api/tickets` ·
`/api/tickets/{id}` · `/api/analytics/overview` · `/api/benchmarks` ·
`/api/admin/schema-status` (`missing_tables: []`, current = head = `3f1c7d2a8b44`) ·
`/api/admin/health` · `/health`.

`tables_present 23` against `tables_expected 22` is not drift: the extra table is
`alembic_version`, which `schema-status` deliberately excludes from `unexpected_tables`.

## 7. BLOCKED, PARTIAL and deferred — explicitly

- **BLOCKED — Docker, Postgres, Redis, AWS, Coolify, COOL.** None are installed or reachable on
  this machine (`docker`, `psql`, `redis-server`, `gh` all absent). Nothing in this phase was run
  against Postgres; every result above is SQLite. No deployment is claimed, and the artifacts
  written for them stay labelled BLOCKED until they actually run.
- **BLOCKED — GitHub Actions / CI.** No `gh` CLI and no SSH key on this machine; pushes go out
  over HTTPS with the stored keychain credential.
- **PARTIAL — the two blur numbers disagree.** The sampler measured 1577.78 on frame 17 while the
  quality tool measured 1398.5 on the same stored PNG, because they compute on different
  preprocessing paths (resized grayscale vs the engine's preprocess chain). Both are real
  measurements of different arrays; reconciling them into one definition is a Phase 5 QA item, and
  until then nothing should quote "the blur score" as a single canonical number.
- **PARTIAL — mp4 round-trip noise.** The video fixture's *clean* half produced 7 regions
  (categories `visual_change`/`new_texture`/`detail_loss`, all severity `info`, all low confidence)
  purely from `mp4v` compression against a PNG reference. The agent correctly declined to raise a
  ticket for `info` severity. Real video will show the same effect; a compression-aware threshold
  or a reference taken from the same codec is a Phase 4/5 investigation, not a claim I can make now.
- **NOT IMPLEMENTED — live camera input.** `input_type = "live"` exists in a request schema and
  nothing reads it. There is no webcam path and no UI should imply one.
- **DEFERRED to Phase 4 — the UI for what this phase produced.** The step trace, the six evidence
  artifacts, `video_sampling`, and the per-frame temporal series are all persisted and reachable
  over HTTP, but no page renders them yet, and there is no endpoint that streams a sampled frame
  (the `inspection_frames` rows are write-only until Phase 4 adds the read path).
- **DEFERRED to Phase 5 — pytest.** Verification in this phase was done with HTTP-driving scripts
  kept in `/tmp`, not committed tests. A committed suite, `verify-*.sh` harnesses and the
  frontend Dockerfile are the next stage's work.
- **DEFERRED — N+1 reads.** `GET /api/agent/runs` issues four queries per run. Correct output,
  wrong shape; fix it before any dataset grows past the demo scale.
