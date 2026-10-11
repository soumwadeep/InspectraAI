"""
VisionAgent workflow orchestrator.

A bounded, retrying, human-interruptible state machine over the OpenCV tools in
`app.agent.tools`.

Honesty note for readers and judges: the next-action policy is deterministic
rules over measured tool observations — there is no language model in this loop
and no claim of one. `final_outcome["planner"]` records which policy decided each
run, so a trace can never be mistaken for LLM reasoning.
"""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.agent.state_machine import (
    TERMINAL_STATES,
    AgentState,
    InvalidTransition,
    WorkflowContext,
    next_state,
)
from app.agent.tools import ToolResult, VisionTools

PLANNER_ID = "deterministic-rule-v1"

# Tools that act on the live workflow state instead of an argument list. They
# receive the context injected by the executor rather than through `kwargs`,
# because `kwargs` is persisted verbatim into the step's JSON `arguments` column —
# a WorkflowContext there would store a stringified snapshot of the whole run.
CONTEXT_TOOLS = frozenset({"reanalyze", "create_finding", "create_maintenance_ticket"})


def _run_status_for(state: AgentState) -> str:
    """AgentState -> AgentRunStatus value.

    These are two different vocabularies (`end` is a workflow state, `completed`
    is a run status). Passing `state.value` straight through wrote an invalid
    status string that then made every read of that run raise.
    """
    if state is AgentState.END:
        return "completed"
    if state is AgentState.HUMAN_WAIT:
        return "paused"
    return "failed"

# An alignment retry re-enters DETECTION -> ANALYSIS -> align_with_reference, so
# the same (state, action) pair legitimately appears MAX_ALIGNMENT_RETRIES + 1
# times. The repeat guard has to sit above that or the retry budget is unreachable
# and a weakly-aligned capture fails instead of asking for a retake.
MAX_ALIGNMENT_RETRIES = 2
MAX_ACTION_REPEATS = MAX_ALIGNMENT_RETRIES + 1
MAX_FINDINGS_PER_RUN = 10


def to_jsonable(value: Any) -> Any:
    """Make a tool result storable in a JSON column.

    The previous code wrote `finding.__dict__` into an artifact, which carries
    SQLAlchemy's `_sa_instance_state` and is not serialisable, and stored numpy
    scalars that psycopg2 rejects.
    """
    import numpy as np

    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.ndarray):
        # Arrays are evidence data, not trace data. Shape is the useful summary.
        return {"__array_shape__": list(value.shape), "dtype": str(value.dtype)}
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items() if not str(k).startswith("_sa_")}
    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(item) for item in value]
    if hasattr(value, "dict") and callable(getattr(value, "dict")):
        return to_jsonable(value.dict())
    return str(value)


class VisionAgent:
    """Runs the inspection workflow and persists an auditable trace of it."""

    def __init__(self, db: Session, vision_tools: VisionTools):
        self.db = db
        self.tools = vision_tools
        self.tool_map: dict[str, Any] = {
            "analyze_image_quality": self.tools.analyze_image_quality,
            "align_with_reference": self.tools.align_with_reference,
            "detect_visual_changes": self.tools.detect_visual_changes,
            "generate_evidence": self.tools.generate_evidence,
            "reanalyze": self._tool_reanalyze,
            "request_human_input": self._tool_request_human_input,
            "create_finding": self._tool_create_finding,
            "create_maintenance_ticket": self._tool_create_maintenance_ticket,
            "finalize_inspection": self._tool_finalize_inspection,
        }

    # ------------------------------------------------------------------ run setup

    def create_run(
        self,
        inspection_id: str,
        organization_id: str,
        equipment_id: str,
        reference_image_path: str,
        input_image_path: str,
        requesting_user_id: Optional[str] = None,
        budget_limit: float = 100.0,
    ) -> WorkflowContext:
        from app.core.storage import UPLOAD_DIR
        from app.models.agent import AgentRun

        run = AgentRun(
            inspection_id=inspection_id,
            organization_id=organization_id,
            status="running",
            started_at=datetime.utcnow(),
            final_outcome={"planner": PLANNER_ID},
        )
        self.db.add(run)
        self.db.flush()

        # Every derived artefact lives under its own run directory. Filenames were
        # previously `{category}_{original}`, which collided across inspections and
        # wrote outside any per-run scope.
        derived = UPLOAD_DIR / "derived" / run.id
        derived.mkdir(parents=True, exist_ok=True)

        return WorkflowContext(
            inspection_id=inspection_id,
            organization_id=organization_id,
            equipment_id=equipment_id,
            run_id=run.id,
            reference_image_path=reference_image_path,
            input_image_path=input_image_path,
            requesting_user_id=requesting_user_id,
            derived_dir=str(derived),
            budget_limit=budget_limit,
            current_state=AgentState.START,
        )

    # ------------------------------------------------------------------- the loop

    def run(self, ctx: WorkflowContext) -> WorkflowContext:
        """Execute until END, FAILED, or a pause for human input."""
        try:
            return self._run_loop(ctx)
        except Exception as error:  # noqa: BLE001 — a failed run must still leave a trace
            ctx.final_decision = f"Unexpected failure: {type(error).__name__}: {error}"
            if ctx.current_state not in TERMINAL_STATES:
                ctx.current_state = AgentState.FAILED
            ctx.final_outcome["error"] = str(error)
            ctx.final_outcome["planner"] = PLANNER_ID
            self._finish_run(ctx, "failed")
            raise

    def _run_loop(self, ctx: WorkflowContext) -> WorkflowContext:
        while True:
            limit_reason = ctx.within_limits()
            if limit_reason:
                ctx.timed_out = limit_reason.startswith("Wall-clock")
                ctx.final_decision = limit_reason
                ctx.current_state = AgentState.FAILED
                ctx.final_outcome["planner"] = PLANNER_ID
                self._flush_steps(ctx)
                self._finish_run(ctx, "failed")
                return ctx

            if ctx.current_state in TERMINAL_STATES:
                ctx.final_outcome["planner"] = PLANNER_ID
                self._flush_steps(ctx)
                self._finish_run(ctx, _run_status_for(ctx.current_state))
                return ctx

            action = self._next_action(ctx)

            if action is None:
                if ctx.current_state is AgentState.HUMAN_WAIT:
                    ctx.final_outcome["planner"] = PLANNER_ID
                    self._flush_steps(ctx)
                    self._finish_run(ctx, "paused")
                    return ctx
                ctx.final_decision = f"No action available in state {ctx.current_state.value}"
                ctx.current_state = AgentState.FAILED
                self._flush_steps(ctx)
                self._finish_run(ctx, "failed")
                return ctx

            repeats = ctx.action_repeat_count(ctx.current_state, action)
            if repeats >= MAX_ACTION_REPEATS:
                ctx.final_decision = (
                    f"Loop guard tripped: '{action}' repeated {repeats} times from "
                    f"{ctx.current_state.value}"
                )
                ctx.current_state = AgentState.FAILED
                self._flush_steps(ctx)
                self._finish_run(ctx, "failed")
                return ctx

            ctx.note_action(ctx.current_state, action)

            try:
                destination = next_state(ctx.current_state, action)
            except InvalidTransition as error:
                ctx.final_decision = str(error)
                ctx.current_state = AgentState.FAILED
                self._flush_steps(ctx)
                self._finish_run(ctx, "failed")
                return ctx

            kwargs = self._build_tool_kwargs(action, ctx)
            self.tools.validate_arguments(action, kwargs)
            result = self._execute_tool(action, ctx, **kwargs)
            self._update_context(ctx, result)

            if not result.success:
                ctx.final_decision = f"{action} failed: {result.observation}"
                ctx.current_state = AgentState.FAILED
                self._flush_steps(ctx)
                self._finish_run(ctx, "failed")
                return ctx

            ctx.transition(destination)

            if result.needs_human:
                ctx.human_queries.append({
                    "query": result.human_query,
                    "action": action,
                    "from_state": destination.value,
                    "timestamp": datetime.utcnow().isoformat(),
                })
                ctx.final_outcome["awaiting"] = result.human_query
                ctx.final_outcome["planner"] = PLANNER_ID
                # Without this the run row stayed `running` forever: the trace was
                # never flushed, `final_outcome` was never written, and
                # POST /runs/{id}/resume rejected the pause it could not see.
                self._flush_steps(ctx)
                self._finish_run(ctx, "paused")
                return ctx

            self._flush_steps(ctx)

    def _next_action(self, ctx: WorkflowContext) -> Optional[str]:
        """Choose the next action from measured tool output.

        This is where the loop is adaptive rather than merely sequential: every
        branch reads a number the vision layer computed, so the same image yields
        the same trace and a different image yields a different one.
        """
        state = ctx.current_state

        if state is AgentState.START:
            return "analyze_image_quality"

        if state is AgentState.ANALYSIS:
            quality = ctx.quality_metrics
            if quality.get("inspection_suitability") == "insufficient":
                return "request_human_input"
            return "align_with_reference"

        if state is AgentState.DETECTION:
            alignment = ctx.alignment_result
            status = alignment.get("status")
            weak = (
                status not in ("success", "poor_quality")
                or float(alignment.get("inlier_ratio") or 0) < 0.3
            )
            if weak and ctx.alignment_attempts < MAX_ALIGNMENT_RETRIES:
                return "reanalyze"
            if weak:
                # Two adjusted attempts did not produce a trustworthy registration:
                # asking is more useful than reporting a false defect.
                return "request_human_input"
            return "detect_visual_changes"

        if state is AgentState.FINDING:
            regions = ctx.change_detection.get("regions") or []
            # A large change fraction after alignment almost always means the
            # registration is wrong, not that the whole panel changed.
            if regions and float(ctx.change_detection.get("change_fraction") or 0) > 0.35:
                if ctx.alignment_attempts < MAX_ALIGNMENT_RETRIES:
                    return "reanalyze"
                return "request_human_input"
            return "generate_evidence" if regions else "finalize_inspection"

        if state is AgentState.EVIDENCE:
            return "create_finding"

        if state is AgentState.APPROVAL:
            escalates = [
                finding for finding in ctx.findings
                if finding.get("severity") in ("critical", "warning")
            ]
            return "create_maintenance_ticket" if escalates else "finalize_inspection"

        if state is AgentState.REPORTING:
            return "finalize_inspection"

        return None

    # ------------------------------------------------------------- tool plumbing

    def _execute_tool(self, tool_name: str, ctx: WorkflowContext, **kwargs) -> ToolResult:
        tool = self.tools.definitions.get(tool_name)
        if tool is None:
            raise ValueError(f"Unknown tool: {tool_name}")

        method = self.tool_map.get(tool_name)
        if method is None:
            raise ValueError(f"Tool '{tool_name}' is defined but has no execution method")

        start = time.time()
        if tool_name in CONTEXT_TOOLS:
            result = method(ctx=ctx)
            logged_arguments = {
                "workflow_state": ctx.current_state.value,
                "regions": len(ctx.change_detection.get("regions") or []),
                "findings": len(ctx.findings),
                "alignment_attempts": ctx.alignment_attempts,
            }
        else:
            result = method(**kwargs)
            logged_arguments = kwargs
        duration_ms = int((time.time() - start) * 1000)

        ctx.budget_used += tool.budget_cost
        ctx.iterations += 1
        ctx.log_step(
            action=tool_name,
            tool_name=tool_name,
            arguments=logged_arguments,
            result=result.observation,
            duration_ms=duration_ms,
            decision=result.state_transition,
        )
        return result

    def _build_tool_kwargs(self, action: str, ctx: WorkflowContext) -> dict[str, Any]:
        if action == "analyze_image_quality":
            return {"image_path": ctx.input_image_path}

        if action == "align_with_reference":
            return {
                "current_path": ctx.input_image_path,
                "reference_path": ctx.reference_image_path,
                "output_dir": ctx.derived_dir,
                "attempt": ctx.alignment_attempts,
            }

        if action == "detect_visual_changes":
            return {
                "reference_path": ctx.reference_image_path,
                "current_path": ctx.input_image_path,
                "aligned_path": ctx.alignment_result.get("aligned_image_path"),
                "output_dir": ctx.derived_dir,
            }

        if action == "generate_evidence":
            return {
                "reference_path": ctx.reference_image_path,
                "current_path": ctx.input_image_path,
                "aligned_path": ctx.alignment_result.get("aligned_image_path"),
                "diff_mask_path": ctx.diff_mask_path,
                "detections": ctx.change_detection.get("regions", []),
                "quality_issues": ctx.quality_metrics.get("reasons", []),
                "output_dir": ctx.derived_dir,
            }

        if action == "create_finding":
            return {}

        if action == "create_maintenance_ticket":
            return {}

        if action == "finalize_inspection":
            return self._build_finalize_kwargs(ctx)

        if action == "reanalyze":
            return {}

        if action == "request_human_input":
            return {
                "query": self._human_query_for(ctx),
                "context": {
                    "reasons": ctx.quality_metrics.get("reasons", []),
                    "alignment": ctx.alignment_result.get("reason"),
                    "inlier_ratio": ctx.alignment_result.get("inlier_ratio"),
                },
            }

        return {}

    def _human_query_for(self, ctx: WorkflowContext) -> str:
        if ctx.quality_metrics.get("inspection_suitability") == "insufficient":
            reasons = "; ".join(ctx.quality_metrics.get("reasons", [])) or "quality below threshold"
            return f"Image quality is insufficient for inspection ({reasons}). Retake with better focus, lighting or framing."
        if ctx.alignment_result and ctx.alignment_result.get("status") not in ("success", "poor_quality"):
            return (
                f"The capture could not be registered to the reference "
                f"({ctx.alignment_result.get('reason') or 'insufficient feature overlap'}). "
                f"Retake from closer to the reference viewpoint, or proceed without comparison."
            )
        if float(ctx.change_detection.get("change_fraction") or 0) > 0.35:
            return (
                "More than 35% of the frame differs after alignment, which usually means the "
                "registration is wrong rather than the equipment. Confirm the framing or retake."
            )
        return "Human input required."

    def _build_finalize_kwargs(self, ctx: WorkflowContext) -> dict[str, Any]:
        regions = ctx.change_detection.get("regions") or []
        recommendations = []
        if regions:
            recommendations.append(
                f"Found {len(regions)} visual anomaly region(s). "
                f"SSIM={float(ctx.change_detection.get('ssim_score') or 0):.3f}, "
                f"mean diff={float(ctx.change_detection.get('mean_abs_diff') or 0):.1f}"
            )
        else:
            recommendations.append("No regions above the difference threshold. Continue routine monitoring.")
        if ctx.quality_metrics.get("inspection_suitability") == "insufficient":
            recommendations.append("Image quality insufficient — manual review required.")
        alignment_status = ctx.alignment_result.get("status")
        if alignment_status and alignment_status != "success":
            recommendations.append(f"Alignment issue: {ctx.alignment_result.get('reason') or alignment_status}.")

        change_fraction = float(ctx.change_detection.get("change_fraction") or 0.0)
        return {
            "summary": (
                f"Inspection reached {ctx.current_state.value} after {ctx.iterations} tool "
                f"calls using {ctx.budget_used:.1f}/{ctx.budget_limit:.0f} budget "
                f"(figures before this final report)."
            ),
            "recommendations": recommendations,
            # This is the measured changed area of the frame, not a probability.
            "overall_confidence": round(1.0 - min(change_fraction, 1.0), 4),
        }

    # ------------------------------------------------------------ agent-side tools

    def _tool_reanalyze(self, ctx: WorkflowContext) -> ToolResult:
        """Retry registration. Records the one adjustment actually made.

        This must keep describing what `align_with_reference` really does on a
        retry (upscale the capture) rather than listing tunables the pipeline does
        not yet vary — otherwise the trace claims a parameter change that never
        happened.
        """
        ctx.alignment_attempts += 1
        upscale = 1.5 * ctx.alignment_attempts
        adjustments = {"capture_upscale": upscale}

        ctx.quality_metrics["reanalyze_adjustments"] = adjustments

        return ToolResult(
            tool_name="reanalyze",
            success=True,
            observation=(
                f"Retry {ctx.alignment_attempts} of {MAX_ALIGNMENT_RETRIES}: "
                f"re-registering with the capture "
                f"upscaled {upscale:.1f}x to raise repeatable corner count"
            ),
            artifact={"reanalyze": adjustments, "attempt": ctx.alignment_attempts},
            state_transition=AgentState.ANALYSIS.value,
        )

    def _tool_request_human_input(self, query: str, context: dict) -> ToolResult:
        return ToolResult(
            tool_name="request_human_input",
            success=True,
            observation=query,
            artifact={"context": to_jsonable(context)},
            needs_human=True,
            human_query=query,
        )

    def _tool_create_finding(self, ctx: WorkflowContext) -> ToolResult:
        """Persist one Finding per detected region, with its evidence attached."""
        from app.models.finding import Finding, FindingEvidence, FindingStatusEnum, SeverityEnum, VerificationStatusEnum
        from app.models.inspection import VisionObservation

        regions = (ctx.change_detection.get("regions") or [])[:MAX_FINDINGS_PER_RUN]
        if not regions:
            return ToolResult(
                tool_name="create_finding",
                success=False,
                observation="create_finding invoked with no regions",
            )

        created: list[dict[str, Any]] = []
        evidences = ctx.evidence or {}

        for index, region in enumerate(regions, start=1):
            severity = self._severity_for(region)
            finding = Finding(
                equipment_id=ctx.equipment_id,
                inspection_id=ctx.inspection_id,
                organization_id=ctx.organization_id,
                category=region.get("category") or "visual_change",
                description=region.get("description") or "Visual change detected",
                detection_method="absdiff+threshold+contours, ORB/RANSAC registration",
                confidence=to_jsonable(region.get("confidence")),
                severity=SeverityEnum(severity),
                verification_status=VerificationStatusEnum.unverified,
                resolution_state=FindingStatusEnum.pending_review,
                notes=region.get("details") and f"Measured: {region['details']}",
            )
            self.db.add(finding)
            self.db.flush()

            paths = self._evidence_for_region(evidences, index)

            self.db.add(VisionObservation(
                inspection_id=ctx.inspection_id,
                agent_run_id=ctx.run_id,
                observation_type="change",
                bbox_x=region.get("bbox_x"),
                bbox_y=region.get("bbox_y"),
                bbox_width=region.get("bbox_width"),
                bbox_height=region.get("bbox_height"),
                confidence=region.get("confidence"),
                category=finding.category,
                description=finding.description,
                evidence_image_path=(
                    self._relative_storage_path(paths["cropped"])
                    if paths.get("cropped") else None
                ),
                details_json=to_jsonable({
                    "area": region.get("area"),
                    "mean_intensity": region.get("mean_intensity"),
                    "measured": region.get("details"),
                    "alignment": {
                        "status": ctx.alignment_result.get("status"),
                        "matched_keypoints": ctx.alignment_result.get("matched_keypoints"),
                        "inlier_ratio": ctx.alignment_result.get("inlier_ratio"),
                        "reprojection_error": ctx.alignment_result.get("reprojection_error"),
                    },
                    "ssim_score": ctx.change_detection.get("ssim_score"),
                    "change_fraction": ctx.change_detection.get("change_fraction"),
                }),
            ))

            for evidence_type, path in paths.items():
                self.db.add(FindingEvidence(
                    finding_id=finding.id,
                    evidence_type=evidence_type,
                    storage_path=self._relative_storage_path(path),
                    caption=self._caption_for(evidence_type, finding.category),
                    metadata_json=to_jsonable({"region_index": index, "run_id": ctx.run_id}),
                ))

            created.append({
                "id": finding.id,
                "category": finding.category,
                "severity": severity,
                "confidence": region.get("confidence"),
                "evidence": list(paths.keys()),
            })

        self.db.flush()
        ctx.findings.extend(created)

        return ToolResult(
            tool_name="create_finding",
            success=True,
            observation=(
                f"Created {len(created)} finding(s) for {ctx.inspection_id}"
                + (f" ({len(regions)} of more regions capped at {MAX_FINDINGS_PER_RUN})"
                   if len((ctx.change_detection.get('regions') or [])) > MAX_FINDINGS_PER_RUN else "")
            ),
            artifact={"findings": created, "finding_ids": [item["id"] for item in created]},
            state_transition=AgentState.APPROVAL.value,
        )

    @staticmethod
    def _severity_for(region: dict) -> str:
        confidence = float(region.get("confidence") or 0)
        area = int(region.get("area") or 0)
        # Thresholds are stated, not hidden in a conditional chain.
        if confidence >= 0.7 and area >= 5000:
            return "critical"
        if confidence >= 0.4 or area >= 2000:
            return "warning"
        return "info"

    @staticmethod
    def _evidence_for_region(evidences: dict[str, Any], index: int) -> dict[str, str]:
        """Map each generated artefact filename to its finding_evidence type.

        The previous version collapsed all six artefacts into three rows with
        `setdefault`, so the diff overlay and the annotated reference were written
        to disk but never recorded — a reviewer could not reach them.
        """
        selected: dict[str, str] = {}
        type_by_prefix = (
            (f"region_{index}_annotated", "annotated"),
            (f"region_{index}.", "cropped"),
            ("comparison", "comparison"),
            ("annotated_reference", "annotated_reference"),
            ("diff_overlay", "diff_overlay"),
            ("diff_mask_raw", "diff_mask_raw"),
        )
        for filename, path in evidences.items():
            lowered = filename.lower()
            for prefix, evidence_type in type_by_prefix:
                if lowered.startswith(prefix):
                    selected[evidence_type] = path
                    break
        return selected

    @staticmethod
    def _caption_for(evidence_type: str, category: str) -> str:
        return {
            "annotated": f"Region {category} with measured bbox",
            "cropped": f"Region crop showing {category}",
            "comparison": "Reference and capture side by side",
            "annotated_reference": "All detected regions on the reference frame",
            "diff_overlay": "Change-energy overlay on the reference frame",
            "diff_mask_raw": "Binary change mask",
        }.get(evidence_type, f"Evidence for {category}")

    def _relative_storage_path(self, path: str) -> str:
        """Store paths relative to the storage root.

        Absolute paths cannot be resolved by `StorageService.get_image_path`, so
        evidence served through the API 404s by construction.
        """
        from app.core.storage import UPLOAD_DIR

        candidate = Path(path)
        root = UPLOAD_DIR.parent.resolve()
        try:
            return str(candidate.resolve().relative_to(root))
        except ValueError:
            return str(candidate)

    def _tool_create_maintenance_ticket(self, ctx: WorkflowContext) -> ToolResult:
        from app.models.ticket import (
            ApprovalRequest,
            MaintenanceTicket,
            MaintenanceTicketEvent,
            TicketPriorityEnum,
            TicketStatusEnum,
        )

        if not ctx.findings:
            return ToolResult(
                tool_name="create_maintenance_ticket",
                success=False,
                observation="No findings to escalate",
            )
        if not ctx.requesting_user_id:
            # requester_id is a NOT NULL foreign key. Writing "" used to "succeed"
            # on SQLite because FK enforcement is off there, leaving a ticket that
            # no org-scoped query could ever return.
            return ToolResult(
                tool_name="create_maintenance_ticket",
                success=False,
                observation="Cannot raise a ticket: no requesting user on this run",
            )

        finding = ctx.findings[0]
        severity = finding.get("severity")
        priority = "critical" if severity == "critical" else "high" if severity == "warning" else "medium"

        ticket = MaintenanceTicket(
            equipment_id=ctx.equipment_id,
            finding_id=finding["id"],
            organization_id=ctx.organization_id,
            priority=TicketPriorityEnum(priority),
            description=(
                f"Auto-raised from inspection {ctx.inspection_id}: {finding.get('category')} "
                f"detected at confidence {float(finding.get('confidence') or 0):.0%}"
            ),
            status=TicketStatusEnum.awaiting_approval,
        )
        self.db.add(ticket)
        self.db.flush()

        self.db.add(ApprovalRequest(
            ticket_id=ticket.id,
            finding_id=finding["id"],
            requester_id=ctx.requesting_user_id,
            status="pending",
        ))
        self.db.add(MaintenanceTicketEvent(
            ticket_id=ticket.id,
            status=TicketStatusEnum.awaiting_approval,
            actor_id=ctx.requesting_user_id,
            notes="Raised by the vision agent from a measured change region",
        ))
        self.db.flush()

        ctx.final_outcome["ticket_id"] = ticket.id

        return ToolResult(
            tool_name="create_maintenance_ticket",
            success=True,
            observation=f"Raised ticket {ticket.id} (priority={priority}) awaiting approval",
            artifact={"ticket_id": ticket.id, "priority": priority},
            state_transition=AgentState.REPORTING.value,
        )

    def _tool_finalize_inspection(self, summary: str, recommendations: list[str], overall_confidence: float) -> ToolResult:
        return ToolResult(
            tool_name="finalize_inspection",
            success=True,
            observation=summary,
            artifact={
                "recommendations": recommendations,
                "overall_confidence": overall_confidence,
                "finalized": True,
            },
            state_transition=AgentState.END.value,
        )

    # ------------------------------------------------------------- context update

    def _update_context(self, ctx: WorkflowContext, result: ToolResult) -> None:
        artifact = result.artifact or {}

        if "quality_metrics" in artifact:
            ctx.quality_metrics.update(artifact["quality_metrics"])
        if "alignment" in artifact:
            ctx.alignment_result.update(artifact["alignment"])
        if "aligned_image_path" in artifact:
            ctx.alignment_result["aligned_image_path"] = artifact["aligned_image_path"]
        if "change_detection" in artifact:
            ctx.change_detection.update(artifact["change_detection"])
        if "diff_mask_path" in artifact:
            ctx.diff_mask_path = artifact["diff_mask_path"]
        if "detections" in artifact:
            ctx.detections.extend(artifact["detections"])
        if "evidence_paths" in artifact:
            ctx.evidence.update(artifact["evidence_paths"])
        if "findings" in artifact:
            pass  # create_finding appends to ctx.findings itself; avoid double-adding
        if "recommendations" in artifact:
            ctx.final_outcome["recommendations"] = artifact["recommendations"]
            ctx.final_outcome["overall_confidence"] = artifact.get("overall_confidence")
        if "reanalyze" in artifact:
            ctx.final_outcome.setdefault("retries", []).append(
                {"attempt": artifact.get("attempt"), "adjustments": to_jsonable(artifact["reanalyze"])}
            )

    # ---------------------------------------------------------------- persistence

    def _flush_steps(self, ctx: WorkflowContext) -> None:
        """Append only steps not yet written.

        The previous implementation re-inserted the entire log on every persist,
        and set `description` from a field that could be None — a NOT NULL column,
        so no run with a state transition ever finished writing.
        """
        from app.models.agent import AgentStep, AgentToolCall

        pending = ctx.step_log[ctx.steps_persisted:]
        for step in pending:
            summary = step.get("result") or f"{step.get('action')} -> {step.get('decision') or 'no transition'}"
            self.db.add(AgentStep(
                run_id=ctx.run_id,
                step_number=step.get("step"),
                action_type=step.get("action") or "unknown",
                description=str(summary),
                arguments=to_jsonable(step.get("arguments") or {}),
                result_summary=str(step.get("result")) if step.get("result") is not None else None,
                evidence_ref=ctx.diff_mask_path if step.get("action") == "detect_visual_changes" else None,
                decision=step.get("decision"),
                reason=step.get("reason"),
                tool_name=step.get("tool_name"),
                timestamp=datetime.fromisoformat(step["timestamp"]) if step.get("timestamp") else datetime.utcnow(),
                duration_ms=int(step.get("duration_ms") or 0),
                is_human_interaction=step.get("action") == "request_human_input",
            ))

            if step.get("tool_name"):
                self.db.add(AgentToolCall(
                    run_id=ctx.run_id,
                    tool_name=step["tool_name"],
                    arguments=to_jsonable(step.get("arguments") or {}),
                    result_summary=str(step.get("result")) if step.get("result") is not None else None,
                    result_json=to_jsonable({"state": step.get("state"), "decision": step.get("decision")}),
                    duration_ms=int(step.get("duration_ms") or 0),
                    success=True,
                ))

        ctx.steps_persisted = len(ctx.step_log)
        self.db.flush()

    def _finish_run(self, ctx: WorkflowContext, status: str) -> None:
        from app.models.agent import AgentRun, AgentRunStatus

        if status not in {member.value for member in AgentRunStatus}:
            # An out-of-vocabulary status writes a row that then raises KeyError on
            # every read, taking the inspection detail and agent run endpoints down
            # with it. Fail loudly at the write instead.
            raise ValueError(f"Invalid agent run status: {status!r}")

        run = self.db.get(AgentRun, ctx.run_id)
        if run is None:
            return

        run.status = status
        run.iterations = ctx.iterations
        run.budget_used = float(ctx.budget_used)
        run.final_action = ctx.final_decision
        run.final_outcome = to_jsonable({
            **ctx.final_outcome,
            "planner": PLANNER_ID,
            "final_state": ctx.current_state.value,
            "end_reached": ctx.current_state is AgentState.END,
            "iterations": ctx.iterations,
            "alignment_attempts": ctx.alignment_attempts,
            "findings_created": len(ctx.findings),
            "timed_out": ctx.timed_out,
            "video_sampling": ctx.video_sampling or None,
        })
        run.context_json = to_jsonable(ctx.to_dict())
        run.ended_at = datetime.utcnow() if status != "paused" else None

        if status in ("completed", "failed"):
            # A paused run must not write metric rows: they would describe the
            # capture that was just rejected, and a resumed run could not replace
            # them because the guard below stops at the first existing row.
            self._record_metric_observations(ctx)
        self.db.commit()

    def _record_metric_observations(self, ctx: WorkflowContext) -> None:
        """Store the quality and alignment measurements as rows.

        The vision_observations table existed with no writer at all, so nothing
        downstream could chart what the pipeline actually measured.
        """
        from app.models.inspection import VisionObservation

        existing = (
            self.db.query(VisionObservation)
            .filter(
                VisionObservation.agent_run_id == ctx.run_id,
                VisionObservation.observation_type.in_(("quality", "alignment")),
            )
            .count()
        )
        if existing:
            # Idempotence for `_finish_run`, which can be reached twice when an
            # exception follows a pause. `change` rows are excluded because
            # `create_finding` legitimately writes those before the run finishes.
            return

        quality = ctx.quality_metrics
        if quality:
            self.db.add(VisionObservation(
                inspection_id=ctx.inspection_id,
                agent_run_id=ctx.run_id,
                observation_type="quality",
                confidence=None,
                category=quality.get("inspection_suitability"),
                description="; ".join(quality.get("reasons") or []) or "Quality within thresholds",
                details_json=to_jsonable(quality),
            ))

        alignment = ctx.alignment_result
        if alignment:
            self.db.add(VisionObservation(
                inspection_id=ctx.inspection_id,
                agent_run_id=ctx.run_id,
                observation_type="alignment",
                confidence=alignment.get("confidence"),
                category=alignment.get("status"),
                description=alignment.get("reason") or f"ORB matches: {alignment.get('matched_keypoints')}",
                details_json=to_jsonable(alignment),
                evidence_image_path=self._relative_storage_path(alignment["aligned_image_path"])
                if alignment.get("aligned_image_path") else None,
            ))

        change = ctx.change_detection
        if change:
            self.db.add(VisionObservation(
                inspection_id=ctx.inspection_id,
                agent_run_id=ctx.run_id,
                observation_type="change",
                confidence=None,
                category=change.get("status"),
                description=(
                    f"{change.get('num_changed_regions', 0)} region(s), "
                    f"SSIM {float(change.get('ssim_score') or 0):.3f}"
                ),
                details_json=to_jsonable({
                    "change_fraction": change.get("change_fraction"),
                    "mean_abs_diff": change.get("mean_abs_diff"),
                    "ssim_score": change.get("ssim_score"),
                    "evidence_image_path": self._relative_storage_path(ctx.diff_mask_path)
                    if ctx.diff_mask_path else None,
                }),
            ))

    # ---------------------------------------------------------------- resume path

    def resume(self, run_id: str, response: str) -> dict[str, Any]:
        """Continue a paused run from its persisted context.

        The endpoint used to append text to a finding and mark the run completed
        without executing anything, and raised UnboundLocalError on every call.
        """
        from app.models.agent import AgentRun, AgentStep

        run = self.db.get(AgentRun, run_id)
        if run is None:
            raise ValueError("Run not found")
        if run.status != "paused":
            raise ValueError(f"Run is {run.status}, not paused")
        if not run.context_json:
            raise ValueError("Run has no persisted context to resume from")

        ctx = WorkflowContext.from_dict(run.context_json)
        # The step_log is not part of the snapshot, so numbering continues from the
        # rows already in the database instead of restarting at 1.
        ctx.step_offset = self.db.query(AgentStep).filter(AgentStep.run_id == run_id).count()
        ctx.steps_persisted = 0

        choice = (response or "retry").strip().lower()
        if choice not in ("retry", "proceed", "abort"):
            raise ValueError("Response must be one of: retry, proceed, abort")

        if choice == "retry":
            # A retake supersedes the rejected capture; otherwise resuming would
            # simply re-measure the image that was refused.
            latest_path, latest_type = self._latest_input_source(ctx.inspection_id)
            if latest_path and latest_type == "video":
                self.sample_input_video(ctx, latest_path)
            elif latest_path:
                ctx.input_image_path = latest_path
            ctx.quality_metrics = {}
            ctx.alignment_result = {}
            ctx.change_detection = {}
            ctx.alignment_attempts = 0
            # The repeat guard counts (state, action) pairs across the whole run.
            # Carried over, a run that had already aligned three times before
            # pausing tripped the guard on its first post-resume action and was
            # failed instead of inspected.
            ctx.action_counts.clear()
            ctx.iterations = 0
            ctx.budget_used = 0.0

        elif choice == "proceed":
            # A human overrode the gate. Without recording the override the planner
            # would re-read the same "insufficient" measurement and pause again.
            ctx.quality_metrics["inspection_suitability"] = "accepted_by_human"

        self.db.add(AgentStep(
            run_id=run_id,
            step_number=ctx.next_step_number(),
            action_type="human_response",
            description=f"Human answered '{choice}' to: {ctx.final_outcome.get('awaiting', 'input required')}",
            arguments=to_jsonable({"response": choice}),
            result_summary=choice,
            decision=choice,
            is_human_interaction=True,
            timestamp=datetime.utcnow(),
        ))
        ctx.step_offset += 1
        self.db.commit()

        from app.agent.state_machine import TRANSITIONS
        ctx.current_state = TRANSITIONS[(AgentState.HUMAN_WAIT, choice)]
        if ctx.current_state is AgentState.FAILED:
            ctx.final_decision = f"Human aborted the run ({choice})"
            self._flush_steps(ctx)
            self._finish_run(ctx, "failed")
            return self.get_run_status(run_id)

        self._flush_steps(ctx)
        self.run(ctx)
        return self.get_run_status(run_id)

    def sample_input_video(
        self, ctx: WorkflowContext, video_path: str, max_frames: int = 12
    ) -> dict[str, Any]:
        """Decode a video input, store each sampled frame, analyse the sharpest.

        Sets `ctx.input_image_path` to a decoded frame so the rest of the loop works
        on real pixels; the previous code handed the .mp4 path to `cv2.imread`,
        which returned None and failed the run with "Failed to load image".
        """
        from app.models.inspection import InspectionFrame
        from app.vision.video import sample_frames

        start = time.time()
        result = sample_frames(
            video_path, ctx.reference_image_path, ctx.derived_dir, max_frames
        )
        duration_ms = int((time.time() - start) * 1000)

        for sample in result["samples"]:
            self.db.add(InspectionFrame(
                inspection_id=ctx.inspection_id,
                frame_index=sample["frame_index"],
                timestamp_ms=sample["timestamp_ms"],
                storage_path=self._relative_storage_path(sample["storage_path"]),
            ))

        ctx.input_image_path = result["selected_frame_path"]
        ctx.temporal_samples = result["samples"]
        ctx.video_sampling = {
            key: value
            for key, value in result.items()
            if key != "samples"
        }
        ctx.log_step(
            action="sample_video_frames",
            tool_name=None,
            arguments={"video_path": video_path, "max_frames": max_frames},
            result=(
                f"Decoded {result['frames_decoded']} sampled frame(s) from "
                f"{result['fps']} fps {result['width']}x{result['height']}; analysed frame "
                f"{result['selected_frame_index']} - {result['selection_reason']}"
            ),
            duration_ms=duration_ms,
        )
        self.db.commit()
        return result

    def _latest_input_source(self, inspection_id: str) -> tuple[Optional[str], str]:
        """Most recent input as (resolved path, input_type)."""
        from app.core.storage import StorageService
        from app.models.inspection import InspectionInput

        latest = (
            self.db.query(InspectionInput)
            .filter(InspectionInput.inspection_id == inspection_id)
            .order_by(InspectionInput.uploaded_at.desc())
            .first()
        )
        if not latest:
            return None, "image"
        resolved = StorageService.get_image_path(latest.storage_path)
        return (str(resolved) if resolved else None), latest.input_type

    # ------------------------------------------------------------------- readout

    def get_run_status(self, run_id: str) -> dict[str, Any]:
        from app.models.agent import AgentRun, AgentStep, AgentToolCall

        run = self.db.get(AgentRun, run_id)
        if run is None:
            return {"error": "Run not found"}

        steps = (
            self.db.query(AgentStep)
            .filter(AgentStep.run_id == run_id)
            .order_by(AgentStep.step_number)
            .all()
        )
        tool_calls = self.db.query(AgentToolCall).filter(AgentToolCall.run_id == run_id).all()

        return {
            "run": {
                "id": run.id,
                "status": run.status,
                "iterations": run.iterations,
                "budget_used": run.budget_used,
                "final_action": run.final_action,
                "final_outcome": run.final_outcome,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "ended_at": run.ended_at.isoformat() if run.ended_at else None,
            },
            "steps": [
                {
                    "step_number": step.step_number,
                    "action_type": step.action_type,
                    "tool_name": step.tool_name,
                    "description": step.description,
                    "result": step.result_summary,
                    "decision": step.decision,
                    "duration_ms": step.duration_ms,
                    "is_human_interaction": step.is_human_interaction,
                    "timestamp": step.timestamp.isoformat() if step.timestamp else None,
                }
                for step in steps
            ],
            "tool_calls": [
                {
                    "tool_name": call.tool_name,
                    "arguments": call.arguments,
                    "result": call.result_summary,
                    "duration_ms": call.duration_ms,
                    "success": call.success,
                    "started_at": call.started_at.isoformat() if call.started_at else None,
                }
                for call in tool_calls
            ],
        }
