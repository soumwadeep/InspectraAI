"""
State machine for the VisionAgent.

    START → ANALYSIS → DETECTION → FINDING → EVIDENCE → APPROVAL → REPORTING → END

with two legitimate loops: DETECTION → ANALYSIS (re-align with adjusted parameters)
and any state → HUMAN_WAIT (retake request, approval). HUMAN_WAIT leaves via
`resume()`.

Transitions are keyed `(from_state, action) → to_state` using **the exact action
names `VisionAgent.run()` emits**. They used to be keyed by from_state with action
strings that never matched ("complete", "finalize", "regenerate_evidence"), so
every single transition was rejected and the caller force-assigned the state
anyway — which is why `AgentState.END` was unreachable and every inspection was
recorded as failed. `next_state()` now raises `InvalidTransition` instead.

State values double as `InspectionStatusEnum` values, which is why some are
hyphenated. `END` and `FAILED` are terminal and have no inspection equivalent.
"""
from __future__ import annotations

import enum
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


class AgentState(str, enum.Enum):
    START = "start"
    ANALYSIS = "quality-check"
    DETECTION = "analyzing"
    FINDING = "finding"
    EVIDENCE = "awaiting-evidence"
    APPROVAL = "approval"
    REPORTING = "completed"
    HUMAN_WAIT = "paused"
    FAILED = "failed"
    END = "end"


TERMINAL_STATES = (AgentState.END, AgentState.FAILED)


class InvalidTransition(Exception):
    """No legal transition exists for this state and action."""


@dataclass
class WorkflowContext:
    """Mutable state carried through one agent run, and what resume() needs."""

    inspection_id: str
    organization_id: str
    equipment_id: str
    run_id: str
    reference_image_path: Optional[str] = None
    input_image_path: Optional[str] = None
    requesting_user_id: Optional[str] = None
    quality_metrics: dict[str, Any] = field(default_factory=dict)
    alignment_result: dict[str, Any] = field(default_factory=dict)
    change_detection: dict[str, Any] = field(default_factory=dict)
    detections: list[dict[str, Any]] = field(default_factory=list)
    findings: list[dict[str, Any]] = field(default_factory=list)
    evidence: dict[str, Any] = field(default_factory=dict)
    derived_dir: Optional[str] = None
    diff_mask_path: Optional[str] = None
    # Measured per-frame statistics from a video input, oldest sample first.
    temporal_samples: list[dict[str, Any]] = field(default_factory=list)
    video_sampling: dict[str, Any] = field(default_factory=dict)
    budget_used: float = 0.0
    budget_limit: float = 100.0
    iterations: int = 0
    max_iterations: int = 40
    max_wall_seconds: float = 45.0
    started_at: datetime = field(default_factory=datetime.utcnow)
    current_state: AgentState = AgentState.START
    step_log: list[dict[str, Any]] = field(default_factory=list)
    human_queries: list[dict[str, Any]] = field(default_factory=list)
    final_decision: Optional[str] = None
    final_outcome: dict[str, Any] = field(default_factory=dict)
    # Bounded retries and loop detection. Budget alone did not stop the run: the
    # cheapest cycle cost 0.5, so it took ~200 laps to exhaust.
    action_counts: Counter = field(default_factory=Counter)
    alignment_attempts: int = 0
    steps_persisted: int = 0
    # Steps already written for this run before the current attempt. A resumed run
    # starts with an empty step_log, so without an offset its first new step would
    # be numbered 1 again and collide with the pre-pause trace.
    step_offset: int = 0
    timed_out: bool = False

    @property
    def elapsed_seconds(self) -> float:
        return (datetime.utcnow() - self.started_at).total_seconds()

    def next_step_number(self) -> int:
        return self.step_offset + len(self.step_log) + 1

    def log_step(
        self,
        action: str,
        tool_name: Optional[str],
        arguments: dict[str, Any],
        result: Any,
        duration_ms: int,
        decision: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> None:
        self.step_log.append({
            "step": self.step_offset + len(self.step_log) + 1,
            "action": action,
            "tool_name": tool_name,
            "arguments": arguments,
            "result": result,
            "duration_ms": duration_ms,
            "decision": decision,
            "reason": reason,
            "timestamp": datetime.utcnow().isoformat(),
            "state": self.current_state.value,
            "budget_used": self.budget_used,
        })

    def transition(self, new_state: AgentState) -> None:
        old_state = self.current_state
        self.current_state = new_state
        self.log_step(
            action="state_transition",
            tool_name=None,
            arguments={"from": old_state.value, "to": new_state.value},
            result=f"{old_state.value} → {new_state.value}",
            duration_ms=0,
        )

    def within_limits(self) -> Optional[str]:
        """Return the reason this run must stop, or None to continue.

        Three separate guards, because the previous loop had exactly one (budget)
        and three distinct cycles could keep the run alive for hundreds of
        iterations.
        """
        if self.iterations >= self.max_iterations:
            return f"Iteration cap reached ({self.max_iterations})"
        if self.elapsed_seconds > self.max_wall_seconds:
            return f"Wall-clock limit exceeded ({self.max_wall_seconds:.0f}s)"
        if not self.check_budget():
            return f"Tool budget exhausted ({self.budget_used:.1f}/{self.budget_limit})"
        return None

    def note_action(self, state: AgentState, action: str) -> None:
        self.action_counts[(state.value, action)] += 1

    def action_repeat_count(self, state: AgentState, action: str) -> int:
        return self.action_counts[(state.value, action)]

    def check_budget(self) -> bool:
        return self.budget_used < self.budget_limit

    def to_dict(self) -> dict[str, Any]:
        """Serializable snapshot. numpy arrays and ORM rows are excluded upstream."""
        return {
            "inspection_id": self.inspection_id,
            "organization_id": self.organization_id,
            "equipment_id": self.equipment_id,
            "run_id": self.run_id,
            "requesting_user_id": self.requesting_user_id,
            "reference_image_path": self.reference_image_path,
            "input_image_path": self.input_image_path,
            "current_state": self.current_state.value,
            "budget_used": self.budget_used,
            "budget_limit": self.budget_limit,
            "iterations": self.iterations,
            "max_iterations": self.max_iterations,
            "max_wall_seconds": self.max_wall_seconds,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "quality_metrics": self.quality_metrics,
            "alignment_result": self.alignment_result,
            "change_detection": self.change_detection,
            "findings": self.findings,
            "evidence": self.evidence,
            "derived_dir": self.derived_dir,
            "diff_mask_path": self.diff_mask_path,
            "temporal_samples": self.temporal_samples,
            "human_queries": self.human_queries,
            "final_decision": self.final_decision,
            "final_outcome": self.final_outcome,
            "action_counts": {f"{state}|{action}": n for (state, action), n in self.action_counts.items()},
            "alignment_attempts": self.alignment_attempts,
            "steps_persisted": self.steps_persisted,
            "step_offset": self.step_offset,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WorkflowContext":
        """Rebuild a paused context so `resume()` continues real work."""
        context = cls(
            inspection_id=data["inspection_id"],
            organization_id=data["organization_id"],
            equipment_id=data["equipment_id"],
            run_id=data["run_id"],
            reference_image_path=data.get("reference_image_path"),
            input_image_path=data.get("input_image_path"),
            requesting_user_id=data.get("requesting_user_id"),
            quality_metrics=data.get("quality_metrics") or {},
            alignment_result=data.get("alignment_result") or {},
            change_detection=data.get("change_detection") or {},
            findings=data.get("findings") or [],
            evidence=data.get("evidence") or {},
            derived_dir=data.get("derived_dir"),
            diff_mask_path=data.get("diff_mask_path"),
            temporal_samples=data.get("temporal_samples") or [],
            budget_used=float(data.get("budget_used") or 0),
            budget_limit=float(data.get("budget_limit") or 100),
            iterations=int(data.get("iterations") or 0),
            max_iterations=int(data.get("max_iterations") or 40),
            max_wall_seconds=float(data.get("max_wall_seconds") or 45),
            current_state=AgentState(data.get("current_state") or AgentState.START.value),
            human_queries=data.get("human_queries") or [],
            final_decision=data.get("final_decision"),
            final_outcome=data.get("final_outcome") or {},
            alignment_attempts=int(data.get("alignment_attempts") or 0),
            steps_persisted=int(data.get("steps_persisted") or 0),
            step_offset=int(data.get("step_offset") or 0),
        )
        for key, count in (data.get("action_counts") or {}).items():
            state, _, action = key.partition("|")
            context.action_counts[(state, action)] = int(count)
        if data.get("started_at"):
            try:
                context.started_at = datetime.fromisoformat(data["started_at"])
            except ValueError:
                pass
        return context


# (from_state, action) -> to_state
TRANSITIONS: dict[tuple[AgentState, str], AgentState] = {
    (AgentState.START, "analyze_image_quality"): AgentState.ANALYSIS,

    (AgentState.ANALYSIS, "request_human_input"): AgentState.HUMAN_WAIT,
    (AgentState.ANALYSIS, "align_with_reference"): AgentState.DETECTION,
    (AgentState.ANALYSIS, "finalize_inspection"): AgentState.END,

    (AgentState.DETECTION, "detect_visual_changes"): AgentState.FINDING,
    (AgentState.DETECTION, "reanalyze"): AgentState.ANALYSIS,
    (AgentState.DETECTION, "request_human_input"): AgentState.HUMAN_WAIT,

    (AgentState.FINDING, "generate_evidence"): AgentState.EVIDENCE,
    # Genuinely no change is a completed inspection, not a failure to find one.
    # `finalize_inspection` ends the run from every state: routing it through
    # REPORTING instead made the loop report twice, once from FINDING and again
    # from REPORTING, with two different summaries in the trace.
    (AgentState.FINDING, "finalize_inspection"): AgentState.END,
    (AgentState.FINDING, "reanalyze"): AgentState.ANALYSIS,

    (AgentState.EVIDENCE, "create_finding"): AgentState.APPROVAL,
    (AgentState.EVIDENCE, "finalize_inspection"): AgentState.END,

    (AgentState.APPROVAL, "create_maintenance_ticket"): AgentState.REPORTING,
    (AgentState.APPROVAL, "finalize_inspection"): AgentState.END,
    (AgentState.APPROVAL, "request_human_input"): AgentState.HUMAN_WAIT,

    (AgentState.REPORTING, "finalize_inspection"): AgentState.END,

    # Resume outcomes. The waiting state is remembered in the context so
    # `resume()` can pick the branch that matches what was asked.
    # `retry` returns to START, not ANALYSIS: a retake has to clear the quality gate
    # again, otherwise the new capture is aligned and measured without ever being
    # checked. `proceed` accepts the current capture and starts at alignment.
    (AgentState.HUMAN_WAIT, "retry"): AgentState.START,
    (AgentState.HUMAN_WAIT, "proceed"): AgentState.ANALYSIS,
    (AgentState.HUMAN_WAIT, "abort"): AgentState.FAILED,
}


def next_state(state: AgentState, action: str) -> AgentState:
    """Resolve the destination of (state, action) or raise.

    The old code silently reassigned the state when validation failed, so an
    illegal transition was indistinguishable from a legal one in the trace.
    """
    try:
        return TRANSITIONS[(state, action)]
    except KeyError:
        raise InvalidTransition(f"No transition from {state.value} via action '{action}'") from None


def allowed_actions(state: AgentState) -> list[str]:
    return [action for (from_state, action) in TRANSITIONS if from_state == state]
