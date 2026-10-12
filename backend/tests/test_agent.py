"""The agent state machine, its limits, and one full run against real pixels."""
from __future__ import annotations

import numpy as np
import pytest

from app.agent.state_machine import (
    TRANSITIONS,
    AgentState,
    InvalidTransition,
    WorkflowContext,
    next_state,
)
from app.agent.workflow import (
    CONTEXT_TOOLS,
    MAX_ACTION_REPEATS,
    MAX_ALIGNMENT_RETRIES,
    _run_status_for,
)


class TestTransitions:
    def test_finalize_is_terminal_from_every_state_that_may_call_it(self):
        """Regression: FINDING -> finalize -> REPORTING and REPORTING -> finalize
        -> END made a clean inspection report twice, with two different summaries."""
        for state in (
            AgentState.ANALYSIS,
            AgentState.FINDING,
            AgentState.EVIDENCE,
            AgentState.APPROVAL,
            AgentState.REPORTING,
        ):
            assert next_state(state, "finalize_inspection") is AgentState.END, state

    def test_illegal_transition_raises_instead_of_reassigning_silently(self):
        with pytest.raises(InvalidTransition):
            next_state(AgentState.START, "create_finding")

    def test_retry_resumes_at_the_quality_gate(self):
        """A retake must clear quality again, not skip straight to alignment."""
        assert next_state(AgentState.HUMAN_WAIT, "retry") is AgentState.START
        assert next_state(AgentState.HUMAN_WAIT, "proceed") is AgentState.ANALYSIS
        assert next_state(AgentState.HUMAN_WAIT, "abort") is AgentState.FAILED

    def test_every_transition_target_is_a_real_state(self):
        for (source, action), target in TRANSITIONS.items():
            assert isinstance(source, AgentState)
            assert isinstance(target, AgentState), (source, action, target)


class TestRunStatusVocabulary:
    """AgentState values and AgentRunStatus values are different vocabularies.
    Passing state.value through wrote 'end' into an enum column, and every
    subsequent read of that run raised KeyError."""

    def test_state_maps_to_a_valid_run_status(self):
        from app.models.agent import AgentRunStatus

        for state in AgentState:
            status = _run_status_for(state)
            assert status in {member.value for member in AgentRunStatus}, (state, status)

    def test_end_and_failed_are_not_swapped(self):
        assert _run_status_for(AgentState.END) == "completed"
        assert _run_status_for(AgentState.FAILED) == "failed"
        assert _run_status_for(AgentState.HUMAN_WAIT) == "paused"


class TestLimits:
    def test_repeat_guard_sits_above_the_retry_budget(self):
        """With MAX_ACTION_REPEATS == retries, the third alignment tripped the guard
        before the 'ask a human' branch could run, so weak captures failed."""
        assert MAX_ACTION_REPEATS == MAX_ALIGNMENT_RETRIES + 1

    def test_iteration_cap_stops_a_run(self):
        ctx = WorkflowContext(
            inspection_id="i", organization_id="o", equipment_id="e", run_id="r",
            max_iterations=3,
        )
        ctx.iterations = 3
        assert ctx.within_limits() is not None

    def test_wall_clock_cap_stops_a_run(self):
        ctx = WorkflowContext(
            inspection_id="i", organization_id="o", equipment_id="e", run_id="r",
            max_wall_seconds=0.0,
        )
        assert (ctx.within_limits() or "").startswith("Wall-clock")


class TestContextTools:
    def test_context_tools_are_not_model_callable(self):
        """These receive the live WorkflowContext, so their empty schema is not a
        contract and undeclared keys must not be rejected."""
        from app.agent.tools import VisionTools
        from app.vision.engine import VisionEngine

        tools = VisionTools(VisionEngine())
        for name in CONTEXT_TOOLS:
            assert tools.definitions[name].model_callable is False, name
            tools.validate_arguments(name, {"ctx": object()})  # must not raise

    def test_model_callable_tool_rejects_an_undeclared_key(self):
        from app.agent.tools import VisionTools
        from app.vision.engine import VisionEngine

        tools = VisionTools(VisionEngine())
        # Both required paths must be present, otherwise the missing-argument
        # check fires first and the undeclared-key branch is never reached.
        with pytest.raises(ValueError, match="undeclared"):
            tools.validate_arguments(
                "align_with_reference",
                {"current_path": "a.png", "reference_path": "b.png", "nonsense": 1},
            )

    def test_model_callable_tool_rejects_a_missing_required_key(self):
        from app.agent.tools import VisionTools
        from app.vision.engine import VisionEngine

        tools = VisionTools(VisionEngine())
        with pytest.raises(ValueError, match="missing required"):
            tools.validate_arguments("align_with_reference", {"current_path": "x"})


def _fixture_pair(tmp_path):
    """Reference + defect capture written as the files the tools expect."""
    import cv2

    from app.vision.benchmark import draw_panel, inject_defect

    panel = draw_panel(np.random.default_rng(101))
    capture = panel.copy()
    inject_defect(np.random.default_rng(9), "discoloration", capture, 640, 430, 40)
    reference_path = tmp_path / "reference.png"
    capture_path = tmp_path / "capture.png"
    cv2.imwrite(str(reference_path), panel)
    cv2.imwrite(str(capture_path), capture)
    return str(reference_path), str(capture_path)


def _real_graph(db, suffix: str):
    """A committed organization/user/equipment/inspection chain.

    agent_runs has foreign keys on inspection and organization, so fabricated ids
    cannot be used: SQLite enforces them (the pragma is turned on deliberately).
    """
    from app.models.equipment import Equipment
    from app.models.inspection import Inspection
    from app.models.user import Organization

    organization = Organization(name=f"Run Org {suffix}", slug=f"run-org-{suffix}")
    db.add(organization)
    db.flush()

    inspector = UserFactory.make(db, organization)
    equipment = Equipment(
        organization_id=organization.id,
        name=f"Turbine {suffix}",
        category="turbine",
        location="Test bench",
    )
    db.add(equipment)
    db.flush()  # assigns equipment.id; building the Inspection before this stores NULL

    inspection = Inspection(
        equipment_id=equipment.id,
        organization_id=organization.id,
        inspector_id=inspector.id,
    )
    db.add(inspection)
    db.commit()
    return organization, inspector, equipment, inspection


class TestFullRun:
    def test_defect_capture_reaches_end_with_a_finding_and_a_ticket(self, db, tmp_path):
        from app.agent.tools import VisionTools
        from app.agent.workflow import VisionAgent
        from app.models.finding import Finding, FindingEvidence
        from app.models.inspection import (
            Inspection,
            InspectionFrame,
            VisionObservation,
        )
        from app.models.ticket import MaintenanceTicket
        from app.models.user import Organization
        from app.vision.engine import VisionEngine

        organization, inspector, equipment, inspection = _real_graph(db, "full")
        reference_path, capture_path = _fixture_pair(tmp_path)

        agent = VisionAgent(db, VisionTools(VisionEngine()))
        ctx = agent.create_run(
            inspection_id=inspection.id,
            organization_id=organization.id,
            equipment_id=inspection.equipment_id,
            reference_image_path=reference_path,
            input_image_path=capture_path,
            requesting_user_id=inspector.id,
        )
        ctx = agent.run(ctx)

        assert ctx.current_state is AgentState.END, ctx.final_decision
        assert ctx.findings, "a real defect must produce a finding"

        findings = db.query(Finding).filter(Finding.inspection_id == inspection.id).all()
        assert findings
        assert all(f.organization_id == organization.id for f in findings)
        # Every finding must carry servable evidence, not just a row.
        for finding in findings:
            evidence = (
                db.query(FindingEvidence)
                .filter(FindingEvidence.finding_id == finding.id)
                .all()
            )
            assert evidence, finding.id
            assert all(e.storage_path.startswith("uploads/") for e in evidence)

        observations = (
            db.query(VisionObservation)
            .filter(VisionObservation.inspection_id == inspection.id)
            .all()
        )
        assert observations
        assert all(o.agent_run_id == ctx.run_id for o in observations)

        # A warning/critical finding escalates; the planner must not skip that step.
        assert db.query(MaintenanceTicket).count() >= 1
        assert db.query(InspectionFrame).count() == 0  # image input, not video

        run = agent.get_run_status(ctx.run_id)
        assert run["run"]["status"] == "completed"
        assert run["run"]["final_outcome"]["planner"] == "deterministic-rule-v1"
        assert run["run"]["final_outcome"]["end_reached"] is True
        # The trace must be persisted once per step, with no duplicated numbering.
        numbers = [step["step_number"] for step in run["steps"]]
        assert len(numbers) == len(set(numbers)), numbers

    def test_run_without_a_requesting_user_does_not_raise_a_ticket(self, db, tmp_path):
        from app.agent.tools import VisionTools
        from app.agent.workflow import VisionAgent
        from app.models.ticket import MaintenanceTicket
        from app.vision.engine import VisionEngine

        organization, inspector, equipment, inspection = _real_graph(db, "nousr")
        reference_path, capture_path = _fixture_pair(tmp_path)
        agent = VisionAgent(db, VisionTools(VisionEngine()))
        ctx = agent.create_run(
            inspection_id=inspection.id,
            organization_id=organization.id,
            equipment_id=equipment.id,
            reference_image_path=reference_path,
            input_image_path=capture_path,
            requesting_user_id=None,
        )
        ctx = agent.run(ctx)
        assert ctx.findings, "precondition: the fixture must produce a finding"
        assert db.query(MaintenanceTicket).filter(
            MaintenanceTicket.organization_id == organization.id
        ).count() == 0, "a ticket needs a real requester; it must not be invented"


# Small helper so the run test does not depend on the auth fixtures.
from app.core.security import hash_password  # noqa: E402
from app.models.user import RoleEnum, User  # noqa: E402


class UserFactory:
    @staticmethod
    def make(db, organization):
        user = User(
            email=f"runner-{organization.slug}@example.test",
            name="Runner",
            role=RoleEnum.administrator,
            organization_id=organization.id,
            hashed_password=hash_password("x"),
        )
        db.add(user)
        db.flush()
        return user
