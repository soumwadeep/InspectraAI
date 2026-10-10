"""
VisionAgent workflow orchestrator.

Runs the state machine, executes tools, persists results, and manages
human-in-the-loop interactions. This is the agentic engine that drives
autonomous visual inspection.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Optional

import numpy as np

from sqlalchemy.orm import Session

from app.agent.state_machine import AgentState, AgentStateMachine, WorkflowContext
from app.agent.tools import ToolResult, VisionTools


class VisionAgent:
    """
    Autonomous vision agent that orchestrates the full inspection pipeline.

    Workflow:
        START → analyze_image_quality → ALIGN → DETECTION → generate_evidence
              → create_finding → APPROVAL → REPORTING → END

    The agent can pause for human input at any state and resume later.
    It tracks budget (tool call costs) and iterations to prevent runaway processing.
    """

    def __init__(
        self,
        db: Session,
        vision_tools: VisionTools,
    ):
        self.db = db
        self.tools = vision_tools
        self.tool_map: dict[str, callable] = {
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

    def create_run(
        self,
        inspection_id: str,
        organization_id: str,
        equipment_id: str,
        reference_image_path: str,
        input_image_path: str,
        budget_limit: float = 100.0,
    ) -> WorkflowContext:
        """Initialize a new workflow context and state machine."""
        from app.models.agent import AgentRun

        run = AgentRun(
            inspection_id=inspection_id,
            organization_id=organization_id,
            status="running",
            started_at=datetime.utcnow(),
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

        ctx = WorkflowContext(
            inspection_id=inspection_id,
            organization_id=organization_id,
            equipment_id=equipment_id,
            run_id=run.id,
            reference_image_path=reference_image_path,
            input_image_path=input_image_path,
            budget_limit=budget_limit,
            current_state=AgentState.START,
        )
        return ctx

    def _execute_tool(self, tool_name: str, ctx: WorkflowContext, **kwargs) -> ToolResult:
        """Execute a tool, log it in the context, and charge budget."""
        tool = self.tools.definitions.get(tool_name)
        if tool is None:
            raise ValueError(f"Unknown tool: {tool_name}")

        start = time.time()
        method = self.tool_map.get(tool_name)
        if method is None:
            raise ValueError(f"Tool '{tool_name}' is defined but has no execution method")

        result = method(**kwargs)
        duration_ms = int((time.time() - start) * 1000)

        ctx.budget_used += tool.budget_cost
        ctx.iterations += 1
        ctx.log_step(
            action=tool_name,
            tool_name=tool_name,
            arguments=kwargs,
            result=result.observation,
            duration_ms=duration_ms,
            decision=result.state_transition,
        )

        return result

    def run(self, ctx: WorkflowContext) -> WorkflowContext:
        """
        Execute the full workflow from START to terminal state (END or FAILED).

        If the agent encounters a situation requiring human input, it pauses
        with HUMAN_WAIT and returns. Call `resume()` with the human response
        to continue.
        """
        while True:
            next_state, action = self._next_action(ctx)

            if ctx.current_state == AgentState.HUMAN_WAIT:
                return ctx  # Paused for human input

            if not ctx.check_budget():
                ctx.transition(AgentState.FAILED)
                ctx.final_decision = "Budget exhausted"
                self._persist_run(ctx, "failed")
                return ctx

            if action:
                # Determine tool kwargs based on the action
                kwargs = self._build_tool_kwargs(action, ctx)
                result = self._execute_tool(action, ctx, **kwargs)

                # Update context with results
                self._update_context(ctx, result)

                # Update state if tool triggered a transition
                if result.state_transition:
                    new_state = AgentState(result.state_transition)
                    sm = AgentStateMachine(ctx.current_state)
                    if sm.can_transition(new_state, action):
                        ctx.transition(new_state)
                    else:
                        # Still update the state to the requested one
                        ctx.current_state = new_state

                # If tool needs human input, pause
                if result.needs_human:
                    ctx.transition(AgentState.HUMAN_WAIT)
                    ctx.human_queries.append({
                        "query": result.human_query,
                        "tool": action,
                        "timestamp": datetime.utcnow().isoformat(),
                    })
                    self._persist_run(ctx, "paused")
                    return ctx

            if ctx.current_state in (AgentState.END, AgentState.FAILED):
                self._persist_run(ctx, ctx.current_state.value)
                return ctx

    def _next_action(self, ctx: WorkflowContext) -> tuple[AgentState, Optional[str]]:
        """Determine the next action based on current state and context."""
        state = ctx.current_state

        if state == AgentState.START:
            return state, "analyze_image_quality"

        elif state == AgentState.ANALYSIS:
            if ctx.quality_metrics.get("inspection_suitability") == "insufficient":
                return state, "request_human_input"
            return state, "align_with_reference"

        elif state == AgentState.DETECTION:
            # Check if alignment succeeded enough to proceed
            if ctx.alignment_result.get("status") == "failed":
                return state, "reanalyze"
            return state, "detect_visual_changes"

        elif state == AgentState.FINDING:
            if ctx.change_detection.get("num_changed_regions", 0) > 0:
                return state, "generate_evidence"
            else:
                # No changes found
                ctx.final_decision = "No anomalies detected"
                return AgentState.REPORTING, "finalize_inspection"

        elif state == AgentState.EVIDENCE:
            return state, "create_finding"

        elif state == AgentState.APPROVAL:
            if ctx.findings:
                return state, "create_maintenance_ticket"
            return AgentState.REPORTING, "finalize_inspection"

        elif state == AgentState.REPORTING:
            return state, "finalize_inspection"

        elif state == AgentState.HUMAN_WAIT:
            return state, None

        elif state in (AgentState.END, AgentState.FAILED):
            return state, None

        return state, None

    def _build_tool_kwargs(self, action: str, ctx: WorkflowContext) -> dict[str, Any]:
        """Build keyword arguments for a tool call based on the current context."""
        if action == "analyze_image_quality":
            return {"image_path": ctx.input_image_path}

        elif action == "align_with_reference":
            return {
                "current_path": ctx.input_image_path,
                "reference_path": ctx.reference_image_path,
            }

        elif action == "detect_visual_changes":
            kwargs = {
                "reference_path": ctx.reference_image_path,
                "current_path": ctx.input_image_path,
            }
            if ctx.alignment_result.get("aligned_image_path"):
                kwargs["aligned_path"] = ctx.alignment_result["aligned_image_path"]
            return kwargs

        elif action == "generate_evidence":
            return {
                "reference_path": ctx.reference_image_path,
                "current_path": ctx.input_image_path,
                "aligned_path": ctx.alignment_result.get("aligned_image_path"),
                "detections": ctx.change_detection.get("regions", []),
                "quality_issues": ctx.quality_metrics.get("reasons", []),
            }

        elif action == "create_finding":
            return self._build_create_finding_kwargs(ctx)

        elif action == "create_maintenance_ticket":
            return self._build_create_ticket_kwargs(ctx)

        elif action == "finalize_inspection":
            return self._build_finalize_kwargs(ctx)

        elif action == "reanalyze":
            return {"reason": "Alignment failed, retrying with adjusted parameters"}

        elif action == "request_human_input":
            return {
                "query": "Image quality is insufficient. Please retake the photo or proceed manually.",
                "context": ctx.quality_metrics.get("reasons", []),
            }

        return {}

    def _build_create_finding_kwargs(self, ctx: WorkflowContext) -> dict[str, Any]:
        """Build kwargs for creating finding records from detected anomalies."""
        findings = []
        for region in ctx.change_detection.get("regions", []):
            findings.append({
                "equipment_id": ctx.equipment_id,
                "inspection_id": ctx.inspection_id,
                "category": "visual_anomaly",
                "description": region.get("description", "Visual anomaly detected"),
                "severity": "warning" if region.get("confidence", 0) > 0.5 else "info",
                "confidence": region.get("confidence", 0.5),
                "evidence": [],
                "bbox": region.get("bbox", {}),
                "detection_method": "ORB+RANSAC+SSIM change detection",
            })
        # Return first finding for now (in a full implementation, would save all)
        return findings[0] if findings else {
            "equipment_id": ctx.equipment_id,
            "inspection_id": ctx.inspection_id,
            "category": "visual_anomaly",
            "description": "Anomaly detected during inspection",
            "severity": "info",
            "confidence": 0.5,
            "evidence": [],
            "bbox": {},
            "detection_method": "change detection",
        }

    def _build_create_ticket_kwargs(self, ctx: WorkflowContext) -> dict[str, Any]:
        """Build kwargs for creating a maintenance ticket."""
        findings = ctx.findings
        if not findings:
            return {}
        first_finding = findings[0]
        return {
            "finding_id": first_finding.get("id", "unknown"),
            "equipment_id": ctx.equipment_id,
            "priority": "high" if first_finding.get("severity") == "critical" else "medium",
            "description": first_finding.get("description", "Maintenance required"),
            "requires_approval": True,
        }

    def _build_finalize_kwargs(self, ctx: WorkflowContext) -> dict[str, Any]:
        """Build kwargs for finalizing the inspection."""
        recommendations = []
        if ctx.change_detection.get("regions"):
            recommendations.append(
                f"Found {len(ctx.change_detection['regions'])} anomaly region(s). "
                "Review evidence and findings."
            )
        if ctx.quality_metrics.get("inspection_suitability") == "insufficient":
            recommendations.append("Image quality insufficient — manual review required.")

        if not recommendations:
            recommendations.append("No anomalies detected. Continue routine monitoring.")

        overall_conf = ctx.change_detection.get("change_fraction", 0.0)
        if overall_conf < 0.01:
            overall_conf = 1.0  # No changes = high confidence

        return {
            "summary": (
                f"Inspection complete. State: {ctx.current_state.value}. "
                f"Iterations: {ctx.iterations}. "
                f"Budget used: {ctx.budget_used}/{ctx.budget_limit}."
            ),
            "recommendations": recommendations,
            "overall_confidence": float(overall_conf),
        }

    def _tool_reanalyze(self, **kwargs) -> ToolResult:
        """Re-run analysis with adjusted parameters."""
        return ToolResult(
            tool_name="reanalyze",
            success=True,
            observation=f"Re-analyzing with adjusted parameters: {kwargs.get('reason', '')}",
            artifact={"retry_attempt": True},
            state_transition="analyzing",
        )

    def _tool_request_human_input(self, **kwargs) -> ToolResult:
        """Request human input — used for low-quality images or approvals."""
        query = kwargs.get("query", "Human input required")
        return ToolResult(
            tool_name="request_human_input",
            success=True,
            observation=query,
            artifact={
                "context": kwargs.get("context"),
                "options": kwargs.get("options"),
            },
            needs_human=True,
            human_query=query,
        )

    def _tool_create_finding(self, **kwargs) -> ToolResult:
        """Persist a finding record to the database."""
        from app.models.finding import Finding, FindingStatusEnum, SeverityEnum, VerificationStatusEnum

        finding = Finding(
            equipment_id=kwargs["equipment_id"],
            inspection_id=kwargs["inspection_id"],
            organization_id="",  # Will be filled from inspection
            category=kwargs["category"],
            description=kwargs["description"],
            detection_method=kwargs["detection_method"],
            confidence=kwargs.get("confidence"),
            severity=SeverityEnum(kwargs["severity"]),
            verification_status=VerificationStatusEnum.unverified,
            resolution_state=FindingStatusEnum.pending_review,
        )
        self.db.add(finding)
        self.db.commit()
        self.db.refresh(finding)

        # Also save evidence
        for ev in kwargs.get("evidence", []):
            from app.models.finding import FindingEvidence
            fe = FindingEvidence(
                finding_id=finding.id,
                evidence_type=ev.get("type", "annotated"),
                storage_path=ev.get("path", ""),
                caption=ev.get("caption", ""),
                metadata_json=ev.get("metadata", {}),
            )
            self.db.add(fe)

        self.db.commit()

        return ToolResult(
            tool_name="create_finding",
            success=True,
            observation=f"Created finding: {finding.id} ({finding.category})",
            artifact={"finding_id": finding.id, "finding": finding.__dict__},
            state_transition="finding",
        )

    def _tool_create_maintenance_ticket(self, **kwargs) -> ToolResult:
        """Persist a maintenance ticket record."""
        from app.models.ticket import MaintenanceTicket, ApprovalRequest, TicketStatusEnum

        ticket = MaintenanceTicket(
            equipment_id=kwargs["equipment_id"],
            finding_id=kwargs["finding_id"],
            organization_id="",
            priority=kwargs.get("priority", "medium"),
            description=kwargs["description"],
            status=TicketStatusEnum.draft if kwargs.get("requires_approval") else TicketStatusEnum.open,
        )
        self.db.add(ticket)
        self.db.commit()
        self.db.refresh(ticket)

        if kwargs.get("requires_approval"):
            approval = ApprovalRequest(
                ticket_id=ticket.id,
                finding_id=kwargs["finding_id"],
                requester_id="",
                status="pending",
            )
            self.db.add(approval)
            self.db.commit()

        return ToolResult(
            tool_name="create_maintenance_ticket",
            success=True,
            observation=f"Created ticket: {ticket.id} (priority={kwargs.get('priority')})",
            artifact={"ticket_id": ticket.id},
            state_transition="approval",
        )

    def _tool_finalize_inspection(self, **kwargs) -> ToolResult:
        """Finalize the inspection run."""
        ctx_final_decision = kwargs.get("summary", "")
        return ToolResult(
            tool_name="finalize_inspection",
            success=True,
            observation=ctx_final_decision,
            artifact={
                "recommendations": kwargs.get("recommendations", []),
                "overall_confidence": kwargs.get("overall_confidence", 0.0),
            },
            state_transition="completed",
        )

    def _update_context(self, ctx: WorkflowContext, result: ToolResult) -> None:
        """Update the workflow context with tool results."""
        artifact = result.artifact or {}

        if "quality_metrics" in artifact:
            ctx.quality_metrics.update(artifact["quality_metrics"])

        if "alignment" in artifact:
            ctx.alignment_result.update(artifact["alignment"])
            if "aligned_image_path" in artifact:
                ctx.alignment_result["aligned_image_path"] = artifact["aligned_image_path"]

        if "change_detection" in artifact:
            ctx.change_detection.update(artifact["change_detection"])

        if "detections" in artifact:
            ctx.detections.extend(artifact["detections"])

        if "finding_id" in artifact:
            ctx.findings.append({
                "id": artifact["finding_id"],
                **(artifact.get("finding", {}) or {}),
            })

        if "evidence_paths" in artifact:
            ctx.evidence.update(artifact["evidence_paths"])

    def _persist_run(self, ctx: WorkflowContext, status: str) -> None:
        """Persist the agent run state to the database."""
        from app.models.agent import AgentRun

        run = self.db.get(AgentRun, ctx.run_id)
        if run:
            run.status = status
            run.iterations = ctx.iterations
            run.budget_used = ctx.budget_used
            run.final_action = ctx.final_decision
            run.final_outcome = ctx.final_outcome
            run.ended_at = datetime.utcnow()
            self.db.commit()

        # Persist step log
        from app.models.agent import AgentStep, AgentToolCall
        for i, step in enumerate(ctx.step_log):
            agent_step = AgentStep(
                run_id=ctx.run_id,
                step_number=step.get("step", i + 1),
                action_type=step.get("action", ""),
                description=step.get("result", ""),
                arguments=step.get("arguments", {}),
                result_summary=step.get("result"),
                decision=step.get("decision"),
                reason=None,
                tool_name=step.get("tool_name"),
                duration_ms=step.get("duration_ms", 0),
                timestamp=datetime.fromisoformat(step.get("timestamp", datetime.utcnow().isoformat())),
            )
            self.db.add(agent_step)
            self.db.commit()

        # Persist tool calls
        for step in ctx.step_log:
            if step.get("tool_name"):
                tc = AgentToolCall(
                    run_id=ctx.run_id,
                    tool_name=step["tool_name"],
                    arguments=step.get("arguments", {}),
                    result_summary=step.get("result"),
                    duration_ms=step.get("duration_ms", 0),
                )
                self.db.add(tc)

        self.db.commit()

    def get_run_status(self, run_id: str) -> dict[str, Any]:
        """Get the current status and progress of an agent run."""
        from app.models.agent import AgentRun, AgentStep, AgentToolCall

        run = self.db.get(AgentRun, run_id)
        if not run:
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
                    "step_number": s.step_number,
                    "action_type": s.action_type,
                    "tool_name": s.tool_name,
                    "description": s.description,
                    "result": s.result_summary,
                    "decision": s.decision,
                    "duration_ms": s.duration_ms,
                    "timestamp": s.timestamp.isoformat() if s.timestamp else None,
                }
                for s in steps
            ],
            "tool_calls": [
                {
                    "tool_name": tc.tool_name,
                    "arguments": tc.arguments,
                    "result": tc.result_summary,
                    "duration_ms": tc.duration_ms,
                    "success": tc.success,
                    "started_at": tc.started_at.isoformat() if tc.started_at else None,
                }
                for tc in tool_calls
            ],
        }
