"""
Agent tools — callable functions the VisionAgent invokes during its workflow.

Each tool:
- Has a name, description, and JSON schema for its arguments
- Returns a structured result dict
- Costs budget (for the agentic budget tracking system)
- May trigger state transitions
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

import numpy as np

from app.vision.engine import VisionEngine, InspectionResult
from app.vision.quality import QualityMetrics
from app.vision.alignment import AlignmentResult
from app.vision.change_detection import ChangeDetectionResult


@dataclass
class AgentTool:
    """Metadata for an agent tool."""
    name: str
    description: str
    parameters_schema: dict[str, Any]
    budget_cost: float = 1.0
    # Tools that take the live WorkflowContext are orchestration steps, not
    # callable actions a model could ever be offered. `model_callable` keeps that
    # distinction visible instead of implying a tool catalog that does not exist.
    model_callable: bool = True


@dataclass
class ToolResult:
    """Result of executing a tool."""
    tool_name: str
    success: bool
    observation: str
    artifact: dict[str, Any] = field(default_factory=dict)
    state_transition: Optional[str] = None  # Next state if this tool triggers a transition
    needs_human: bool = False
    human_query: Optional[str] = None


class VisionTools:
    """Concrete implementations of the agent's tools using the VisionEngine."""

    def __init__(self, vision_engine: VisionEngine):
        self.engine = vision_engine

        self.definitions: dict[str, AgentTool] = {
            "analyze_image_quality": AgentTool(
                name="analyze_image_quality",
                description=(
                    "Analyze the quality of the captured inspection image. "
                    "Metrics include blur (Laplacian variance), exposure, glare, "
                    "image coverage, and alignment confidence. Determines if the image "
                    "is suitable for inspection."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "image_path": {
                            "type": "string",
                            "description": "Path to the input inspection image"
                        },
                    },
                    "required": ["image_path"],
                },
                budget_cost=2.0,
            ),

            "align_with_reference": AgentTool(
                name="align_with_reference",
                description=(
                    "Align the current image to a reference image of the same equipment "
                    "using ORB feature matching with RANSAC homography estimation. "
                    "Returns alignment confidence and inlier ratio."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "current_path": {
                            "type": "string",
                            "description": "Path to the current inspection image"
                        },
                        "reference_path": {
                            "type": "string",
                            "description": "Path to the reference image for this equipment"
                        },
                        "output_dir": {
                            "type": "string",
                            "description": "Directory the aligned raster is written to"
                        },
                        "attempt": {
                            "type": "integer",
                            "description": "Zero-based registration attempt; adjustments start at 1"
                        },
                    },
                    "required": ["current_path", "reference_path"],
                },
                budget_cost=3.0,
            ),

            "detect_visual_changes": AgentTool(
                name="detect_visual_changes",
                description=(
                    "Detect visual changes between the reference-aligned image and the "
                    "current image using SSIM and pixel difference analysis. "
                    "Returns changed regions with bounding boxes and confidence scores."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "reference_path": {
                            "type": "string",
                            "description": "Path to the reference image"
                        },
                        "current_path": {
                            "type": "string",
                            "description": "Path to the capture being inspected"
                        },
                        "aligned_path": {
                            "type": "string",
                            "description": "Path to the already-aligned image, if registration succeeded"
                        },
                        "output_dir": {
                            "type": "string",
                            "description": "Directory the difference mask is written to"
                        },
                    },
                    "required": ["reference_path", "current_path"],
                },
                budget_cost=2.5,
            ),

            "generate_evidence": AgentTool(
                name="generate_evidence",
                description=(
                    "Generate evidence artifacts for detected findings: annotated images, "
                    "cropped regions, and side-by-side comparison overlays. "
                    "Saves evidence images to the evidence directory."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "reference_path": {
                            "type": "string",
                            "description": "Path to the reference image"
                        },
                        "current_path": {
                            "type": "string",
                            "description": "Path to the capture being inspected"
                        },
                        "aligned_path": {
                            "type": "string",
                            "description": "Path to aligned image for comparison"
                        },
                        "diff_mask_path": {
                            "type": "string",
                            "description": "Path to the difference mask written by detect_visual_changes"
                        },
                        "detections": {
                            "type": "array",
                            "description": "Detected anomaly regions with relative bounding boxes"
                        },
                        "quality_issues": {
                            "type": "array",
                            "description": "Quality reasons to annotate onto the evidence",
                        },
                        "output_dir": {
                            "type": "string",
                            "description": "Per-run directory evidence is written to"
                        },
                    },
                    "required": ["reference_path", "detections"],
                },
                budget_cost=1.5,
            ),

            "create_finding": AgentTool(
                name="create_finding",
                description=(
                    "Persist one findings record per detected change region, each with "
                    "measured severity, the region's relative bounding box, and its "
                    "evidence artefacts. Writes vision_observations rows alongside."
                ),
                # Reads the live WorkflowContext, so its inputs are not a
                # JSON-schema-able argument list.
                parameters_schema={"type": "object", "properties": {}},
                budget_cost=1.0,
                model_callable=False,
            ),

            "create_maintenance_ticket": AgentTool(
                name="create_maintenance_ticket",
                description=(
                    "Create a maintenance ticket for a finding that requires human "
                    "intervention. Sets priority based on severity and assigns to "
                    "an available operator. May also create an approval request."
                ),
                parameters_schema={"type": "object", "properties": {}},
                budget_cost=1.5,
                model_callable=False,
            ),

            "request_human_input": AgentTool(
                name="request_human_input",
                description=(
                    "Pause the agent workflow and request human input for cases where "
                    "autonomous processing is insufficient (poor image quality, ambiguous "
                    "detections, etc.). Returns the human's response."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Question to ask the human"},
                        "context": {"type": "object", "description": "Measured values explaining why input is needed"},
            "options": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Suggested response options"
                            },
                    },
                    "required": ["query", "context"],
                },
                budget_cost=0.5,
            ),

            "reanalyze": AgentTool(
                name="reanalyze",
                description=(
                    "Re-run analysis with adjusted parameters (e.g., improved "
                    "preprocessing, different alignment method) when initial results "
                    "are insufficient."
                ),
                parameters_schema={"type": "object", "properties": {}},
                budget_cost=3.0,
                model_callable=False,
            ),

            "finalize_inspection": AgentTool(
                name="finalize_inspection",
                description=(
                    "Finalize the inspection. Compiles summary, recommendations, "
                    "sets overall confidence, and transitions to completed state."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string"},
            "recommendations": {"type": "array", "items": {"type": "string"}},
            "overall_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                    "required": ["summary"],
                },
                budget_cost=0.5,
            ),
        }

    def validate_arguments(self, tool_name: str, kwargs: dict[str, Any]) -> None:
        """Check a call against the tool's declared schema.

        The schemas used to be documentation nobody consulted, and several of them
        disagreed with the Python signatures. Validating makes them load-bearing:
        a wrong key now fails at the call site instead of surfacing as a TypeError
        mid-run.

        Only model-callable tools are checked for undeclared keys: their schema is a
        catalog contract. Internal steps carry an empty schema because they receive
        the live WorkflowContext, so an undeclared key there is expected, not a bug.
        """
        tool = self.definitions.get(tool_name)
        if tool is None:
            return

        schema = tool.parameters_schema or {}
        properties = schema.get("properties") or {}
        required = schema.get("required") or []

        missing = [name for name in required if name not in kwargs]
        if missing:
            raise ValueError(
                f"Tool '{tool_name}' is missing required argument(s): {', '.join(missing)}"
            )

        if tool.model_callable:
            unexpected = [name for name in kwargs if name not in properties]
            if unexpected:
                raise ValueError(
                    f"Tool '{tool_name}' received undeclared argument(s): {', '.join(sorted(unexpected))}"
                )

        for name, value in kwargs.items():
            expected = (properties.get(name) or {}).get("type")
            if expected and not _matches_json_type(value, expected):
                raise ValueError(
                    f"Tool '{tool_name}' argument '{name}' must be {expected}, "
                    f"got {type(value).__name__}"
                )


    # ---- Tool execution methods ----

    def analyze_image_quality(self, image_path: str) -> ToolResult:
        """Analyze image quality using OpenCV metrics."""
        import cv2

        img = cv2.imread(image_path)
        if img is None:
            return ToolResult(
                tool_name="analyze_image_quality",
                success=False,
                observation=f"Failed to load image from {image_path}",
                state_transition="quality-check",
            )

        metrics = self.engine.analyze_image_quality(img)

        observation = (
            f"Image quality analysis: blur={metrics.blur_score:.1f}, "
            f"exposure={metrics.exposure_score:.2f}, glare={metrics.glare_estimate:.1%}, "
            f"coverage={metrics.image_coverage:.1%}, suitability={metrics.inspection_suitability}"
        )

        return ToolResult(
            tool_name="analyze_image_quality",
            success=True,
            observation=observation,
            artifact={
                "quality_metrics": {
                    "blur_score": metrics.blur_score,
                    "exposure_score": metrics.exposure_score,
                    "glare_estimate": metrics.glare_estimate,
                    "image_coverage": metrics.image_coverage,
                    "brightness_mean": metrics.brightness_mean,
                    "brightness_std": metrics.brightness_std,
                    "saturation_mean": metrics.saturation_mean,
                    "edge_density": metrics.edge_density,
                    "resolution": [metrics.resolution_width, metrics.resolution_height],
                    "inspection_suitability": metrics.inspection_suitability,
                    "reasons": metrics.reasons,
                }
            },
            state_transition="quality-check",
        )

    def align_with_reference(
        self,
        current_path: str,
        reference_path: str,
        output_dir: str | None = None,
        attempt: int = 0,
    ) -> ToolResult:
        """Align current image to reference using ORB + RANSAC."""
        import cv2
        import uuid
        from pathlib import Path

        ref = cv2.imread(reference_path)
        curr = cv2.imread(current_path)

        if ref is None or curr is None:
            return ToolResult(
                tool_name="align_with_reference",
                success=False,
                observation="Failed to load one or both images",
            )

        # The only retry adjustment this pipeline makes: a capture that is small
        # relative to the reference yields too few repeatable corners, so it is
        # upscaled before matching. Stated plainly because it is written into the
        # trace as the reason the second attempt differs from the first.
        if attempt > 0:
            factor = 1.5 * attempt
            curr = cv2.resize(curr, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)

        result = self.engine.align_with_reference(ref, curr)

        observation = (
            f"Alignment: {result.status}, {result.matched_keypoints} keypoints, "
            f"inlier ratio={result.inlier_ratio:.1%}, "
            f"reprojection error={result.reprojection_error:.2f}px"
            + (f" (attempt {attempt + 1}, capture upscaled {1.5 * attempt:.1f}x)" if attempt else "")
        )

        artifact = {
            "alignment": {
                "status": result.status,
                "matched_keypoints": result.matched_keypoints,
                "inlier_ratio": result.inlier_ratio,
                "reprojection_error": result.reprojection_error,
                "confidence": result.confidence,
                "reason": result.reason,
                "attempt": attempt,
            }
        }

        # Save aligned image for the change detector. The previous code did
        # `current_path.replace(".jpg", "_aligned.jpg")`, which misses .jpeg,
        # .webp and uppercase extensions and collides between runs.
        if result.aligned_image is not None and output_dir:
            target = Path(output_dir)
            target.mkdir(parents=True, exist_ok=True)
            suffix = uuid.uuid4().hex[:8]
            aligned_path = target / f"aligned_{suffix}.png"
            if cv2.imwrite(str(aligned_path), result.aligned_image):
                artifact["aligned_image_path"] = str(aligned_path)

            # The homography leaves a band of zero-filled pixels wherever the
            # warped capture does not cover the reference frame. `detect_visual_changes`
            # looks for `<aligned stem>_mask.png` and subtracts that band; without it
            # the border is compared against real content and reported as a change
            # region — which is how a clean retake produced a whole-frame finding.
            if result.aligned_mask is not None:
                mask_path = target / f"aligned_{suffix}_mask.png"
                if cv2.imwrite(str(mask_path), result.aligned_mask):
                    artifact["aligned_mask_path"] = str(mask_path)

        return ToolResult(
            tool_name="align_with_reference",
            success=result.status in ("success", "poor_quality"),
            observation=observation,
            artifact=artifact,
            state_transition="analyzing",
        )

    def detect_visual_changes(
        self,
        reference_path: str,
        current_path: str,
        aligned_path: str | None = None,
        output_dir: str | None = None,
    ) -> ToolResult:
        """Detect visual changes between reference and current/aligned image."""
        import cv2
        import uuid
        from pathlib import Path

        ref = cv2.imread(reference_path)
        curr = cv2.imread(current_path)

        aligned = None
        aligned_mask = None
        if aligned_path:
            aligned = cv2.imread(aligned_path)
            # The alignment stage writes a validity mask alongside the warped
            # raster. Without it the differ counts the black border created by
            # warping as change, which is how a rotation reads as a defect.
            mask_candidate = Path(aligned_path).with_name(Path(aligned_path).stem + "_mask.png")
            if mask_candidate.exists():
                aligned_mask = cv2.imread(str(mask_candidate), cv2.IMREAD_GRAYSCALE)
        else:
            aligned = curr

        if ref is None or curr is None:
            return ToolResult(
                tool_name="detect_visual_changes",
                success=False,
                observation="Failed to load images for comparison",
            )

        result = self.engine.detect_visual_changes(ref, aligned, aligned_mask)

        observation = (
            f"Change detection: {result.status}, "
            f"{result.num_changed_regions} regions, "
            f"SSIM={result.ssim_score:.3f}, "
            f"mean diff={result.mean_abs_diff:.1f}, "
            f"change fraction={result.change_fraction:.2%}"
        )

        # Persist the difference mask. Nothing wrote it before, so the heatmap
        # evidence the UI shows could never exist, and the metric was unreviewable.
        diff_mask_path = None
        if result.diff_mask is not None and output_dir:
            target = Path(output_dir)
            target.mkdir(parents=True, exist_ok=True)
            candidate = target / f"diff_mask_{uuid.uuid4().hex[:8]}.png"
            if cv2.imwrite(str(candidate), result.diff_mask):
                diff_mask_path = str(candidate)

        regions = [
            {
                "bbox": [r.bbox_x, r.bbox_y, r.bbox_width, r.bbox_height],
                "bbox_x": r.bbox_x,
                "bbox_y": r.bbox_y,
                "bbox_width": r.bbox_width,
                "bbox_height": r.bbox_height,
                "area": r.area,
                "confidence": r.confidence,
                "mean_intensity": r.mean_intensity,
                "category": r.category,
                "description": r.description,
                "details": r.details_json,
            }
            for r in result.regions
        ]

        return ToolResult(
            tool_name="detect_visual_changes",
            success=True,
            observation=observation,
            artifact={
                "change_detection": {
                    "status": result.status,
                    "num_changed_regions": result.num_changed_regions,
                    "total_changed_area": result.total_changed_area,
                    "ssim_score": result.ssim_score,
                    "mean_abs_diff": result.mean_abs_diff,
                    "change_fraction": result.change_fraction,
                    "regions": regions,
                },
                "diff_mask_path": diff_mask_path,
            },
            state_transition="finding",
        )

    def generate_evidence(
        self,
        reference_path: str,
        detections: list[dict],
        current_path: str | None = None,
        aligned_path: str | None = None,
        diff_mask_path: str | None = None,
        quality_issues: list[str] | None = None,
        output_dir: str | None = None,
    ) -> ToolResult:
        """Generate evidence artifacts (annotated images, crops, comparisons)."""
        import cv2
        from app.vision.change_detection import ChangedRegion

        ref = cv2.imread(reference_path)
        curr = cv2.imread(current_path) if current_path else None

        if ref is None:
            return ToolResult(
                tool_name="generate_evidence",
                success=False,
                observation="Failed to load reference image for evidence generation",
            )

        aligned = cv2.imread(aligned_path) if aligned_path else curr
        diff_mask = cv2.imread(diff_mask_path, cv2.IMREAD_GRAYSCALE) if diff_mask_path else None

        regions = None
        if detections:
            # The detector already emits relative coordinates, so no second
            # normalisation pass and no guess about pixel versus fraction units.
            regions = [
                ChangedRegion(
                    bbox_x=float(d.get("bbox_x", d["bbox"][0])),
                    bbox_y=float(d.get("bbox_y", d["bbox"][1])),
                    bbox_width=float(d.get("bbox_width", d["bbox"][2])),
                    bbox_height=float(d.get("bbox_height", d["bbox"][3])),
                    area=int(d.get("area", 0)),
                    mean_intensity=float(d.get("mean_intensity", 0.0)),
                    confidence=float(d.get("confidence", 0.5)),
                    description=d.get("description", ""),
                    category=d.get("category", "visual_change"),
                )
                for d in detections
            ]

        from app.vision.evidence import generate_evidence as gen_evidence
        evidence = gen_evidence(
            reference=ref,
            aligned=aligned,
            diff_mask=diff_mask,
            regions=regions,
            quality_issues=quality_issues,
        )

        # Per-run directory supplied by the agent. The shared hardcoded path named
        # files `{category}_{original}`, so two inspections of the same upload
        # overwrote each other's evidence.
        import os
        evidence_dir = output_dir or "storage/uploads/evidence"
        os.makedirs(evidence_dir, exist_ok=True)

        saved_paths = {}
        for images in (
            evidence.annotated_images,
            evidence.cropped_images,
            evidence.comparison_overlays,
            evidence.diff_masks,
        ):
            # The vision layer already names each artefact by kind
            # (`annotated_reference.png`, `diff_overlay.png`, `region_1.png`), so
            # the filenames are unique. Prefixing them again produced
            # `annotated_annotated_reference.png` on disk.
            for filename, data in images.items():
                path = os.path.join(evidence_dir, filename)
                with open(path, "wb") as f:
                    f.write(data)
                saved_paths[filename] = path

        return ToolResult(
            tool_name="generate_evidence",
            success=True,
            observation=f"Generated {sum(len(v) for v in [evidence.annotated_images, evidence.cropped_images, evidence.comparison_overlays, evidence.diff_masks])} evidence artifacts",
            artifact={
                "evidence_paths": saved_paths,
                "evidence_metadata": evidence.metadata,
            },
            state_transition="awaiting-evidence",
        )


# Module-level helpers live after the class: inserting them between methods would
# end the class body and quietly turn every later method into unreachable nested
# code that still compiles.
_TYPE_CHECKS = {
    "string": lambda value: isinstance(value, str),
    "integer": lambda value: isinstance(value, int) and not isinstance(value, bool),
    "number": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool),
    "boolean": lambda value: isinstance(value, bool),
    "array": lambda value: isinstance(value, (list, tuple)),
    "object": lambda value: isinstance(value, dict),
}


def _matches_json_type(value: Any, expected: str) -> bool:
    """Optional arguments may legitimately be absent or None."""
    if value is None:
        return True
    check = _TYPE_CHECKS.get(expected)
    return True if check is None else bool(check(value))
