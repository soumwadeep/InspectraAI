"""
State machine for the VisionAgent.

The agent progresses through well-defined states during an inspection run:

    START → ANALYSIS → DETECTION → FINDING → EVIDENCE → APPROVAL → REPORTING → END

Transitions may loop back (e.g., ANALYSIS → DETECTION → BACK to ANALYSIS with new reference),
and any state can pause to wait for human input (HUMAN_WAIT).

States map to the InspectionStatusEnum values used in the database.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Optional


class AgentState(str, enum.Enum):
    """States in the agent's state machine."""
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


@dataclass
class StateTransition:
    """Definition of a valid transition between states."""
    from_state: AgentState
    to_state: AgentState
    action: str  # The agent action that triggers this transition
    condition: Optional[Callable[[dict[str, Any]], bool]] = None


@dataclass
class WorkflowContext:
    """Mutable context carried through the agent's state machine execution."""
    inspection_id: str
    organization_id: str
    equipment_id: str
    run_id: str
    reference_image_path: Optional[str] = None
    input_image_path: Optional[str] = None
    quality_metrics: dict[str, Any] = field(default_factory=dict)
    alignment_result: dict[str, Any] = field(default_factory=dict)
    change_detection: dict[str, Any] = field(default_factory=dict)
    detections: list[dict[str, Any]] = field(default_factory=list)
    findings: list[dict[str, Any]] = field(default_factory=list)
    evidence: dict[str, Any] = field(default_factory=dict)
    budget_used: float = 0.0
    budget_limit: float = 100.0
    iterations: int = 0
    started_at: datetime = field(default_factory=datetime.utcnow)
    current_state: AgentState = AgentState.START
    step_log: list[dict[str, Any]] = field(default_factory=list)
    human_queries: list[dict[str, Any]] = field(default_factory=list)
    final_decision: Optional[str] = None
    final_outcome: dict[str, Any] = field(default_factory=dict)

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
        """Append a step to the agent's step log."""
        self.step_log.append({
            "step": len(self.step_log) + 1,
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
        """Transition to a new state, logging the change."""
        old_state = self.current_state
        self.current_state = new_state
        self.log_step(
            action=f"state_transition",
            tool_name=None,
            arguments={"from": old_state.value, "to": new_state.value},
            result=None,
            duration_ms=0,
        )

    def check_budget(self) -> bool:
        """Check if budget is still available."""
        return self.budget_used < self.budget_limit

    def to_dict(self) -> dict[str, Any]:
        return {
            "inspection_id": self.inspection_id,
            "organization_id": self.organization_id,
            "equipment_id": self.equipment_id,
            "run_id": self.run_id,
            "current_state": self.current_state.value,
            "budget_used": self.budget_used,
            "budget_limit": self.budget_limit,
            "iterations": self.iterations,
            "quality_metrics": self.quality_metrics,
            "alignment_result": self.alignment_result,
            "change_detection": self.change_detection,
            "detections": self.detections,
            "findings": self.findings,
            "evidence": self.evidence,
            "step_log": self.step_log,
            "final_decision": self.final_decision,
            "final_outcome": self.final_outcome,
            "started_at": self.started_at.isoformat() if self.started_at else None,
        }


# Valid state transitions: from_state -> set of possible (to_state, action)
STATE_TRANSITIONS: dict[AgentState, list[tuple[AgentState, str]]] = {
    AgentState.START: [
        (AgentState.ANALYSIS, "analyze_image_quality"),
    ],
    AgentState.ANALYSIS: [
        (AgentState.DETECTION, "align_with_reference"),
        (AgentState.HUMAN_WAIT, "request_human_input"),
    ],
    AgentState.DETECTION: [
        (AgentState.FINDING, "detect_visual_changes"),
        (AgentState.ANALYSIS, "reanalyze"),  # loop back for re-inspection
    ],
    AgentState.FINDING: [
        (AgentState.EVIDENCE, "generate_evidence"),
        (AgentState.DETECTION, "recheck"),
    ],
    AgentState.EVIDENCE: [
        (AgentState.APPROVAL, "create_finding"),
        (AgentState.FINDING, "regenerate_evidence"),
    ],
    AgentState.APPROVAL: [
        (AgentState.REPORTING, "finalize"),
        (AgentState.HUMAN_WAIT, "request_approval"),
    ],
    AgentState.REPORTING: [
        (AgentState.END, "complete"),
    ],
    AgentState.HUMAN_WAIT: [
        (AgentState.ANALYSIS, "retry"),
        (AgentState.APPROVAL, "resume_approval"),
        (AgentState.DETECTION, "retry"),
    ],
    AgentState.END: [],
    AgentState.FAILED: [],
}


class AgentStateMachine:
    """Validates and manages state transitions for the VisionAgent."""

    def __init__(self, initial_state: AgentState = AgentState.START):
        self.current_state = initial_state
        self.history: list[AgentState] = [initial_state]

    def can_transition(self, to_state: AgentState, action: str) -> bool:
        """Check if a transition is valid for the given action."""
        valid_transitions = STATE_TRANSITIONS.get(self.current_state, [])
        for valid_to, valid_action in valid_transitions:
            if valid_to == to_state and valid_action == action:
                return True
        return False

    def transition(self, to_state: AgentState, action: str) -> bool:
        """Attempt to transition. Returns True if successful."""
        if self.can_transition(to_state, action):
            self.current_state = to_state
            self.history.append(to_state)
            return True
        return False

    def is_terminal(self) -> bool:
        return self.current_state in (AgentState.END, AgentState.FAILED)

    def reset(self) -> None:
        self.current_state = AgentState.START
        self.history = [AgentState.START]
