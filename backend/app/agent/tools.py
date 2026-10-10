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
                        "current_image_path": {
                            "type": "string",
                            "description": "Path to the current inspection image"
                        },
                        "reference_image_path": {
                            "type": "string",
                            "description": "Path to the reference image for this equipment"
                        },
                    },
                    "required": ["current_image_path", "reference_image_path"],
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
                        "reference_image_path": {
                            "type": "string",
                            "description": "Path to the reference image"
                        },
                        "current_image_path": {
                            "type": "string",
                            "description": "Path to the aligned current image"
                        },
                        "aligned_image_path": {
                            "type": "string",
                            "description": "Path to the already-aligned image (optional, skip re-alignment)"
                        },
                    },
                    "required": ["reference_image_path", "current_image_path"],
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
                        "reference_image_path": {
                            "type": "string",
                            "description": "Path to the reference image"
                        },
                        "detection_results": {
                            "type": "array",
                            "description": "List of detected anomaly regions with bboxes"
                        },
                        "aligned_image_path": {
                            "type": "string",
                            "description": "Path to aligned image for comparison"
                        },
            "diff_mask_path": {
                            "type": "string",
                            "description": "Path to difference mask"
                        },
                    },
                    "required": ["reference_image_path", "detection_results"],
                },
                budget_cost=1.5,
            ),

            "create_finding": AgentTool(
                name="create_finding",
                description=(
                    "Create a findings record for detected anomalies. Includes "
                    "severity classification, anomaly description, and evidence references."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "equipment_id": {"type": "string"},
                        "inspection_id": {"type": "string"},
                        "category": {"type": "string"},
                        "description": {"type": "string"},
                        "severity": {"type": "string", "enum": ["critical", "warning", "info"]},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "evidence": {"type": "array", "description": "List of evidence artifacts"},
            "bbox": {
                            "type": "object",
                            "description": "Bounding box of the finding"
                        },
            "detection_method": {"type": "string"},
                    },
                    "required": ["equipment_id", "inspection_id", "category", "description", "severity"],
                },
                budget_cost=1.0,
            ),

            "create_maintenance_ticket": AgentTool(
                name="create_maintenance_ticket",
                description=(
                    "Create a maintenance ticket for a finding that requires human "
                    "intervention. Sets priority based on severity and assigns to "
                    "an available operator. May also create an approval request."
                ),
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "finding_id": {"type": "string"},
                        "equipment_id": {"type": "string"},
                        "priority": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                        "description": {"type": "string"},
            "requires_approval": {"type": "boolean", "default": False},
                    },
                    "required": ["finding_id", "equipment_id", "description"],
                },
                budget_cost=1.5,
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
            "context": {"type": "string", "description": "Context about why input is needed"},
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
                parameters_schema={
                    "type": "object",
                    "properties": {
                        "reason": {"type": "string"},
            "parameters": {"type": "object", "description": "Adjusted parameters for re-analysis"},
                    },
                    "required": ["reason"],
                },
                budget_cost=3.0,
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
                    "optional": ["recommendations", "overall_confidence"],
                },
                budget_cost=0.5,
            ),
        }

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
        self, current_path: str, reference_path: str
    ) -> ToolResult:
        """Align current image to reference using ORB + RANSAC."""
        import cv2

        ref = cv2.imread(reference_path)
        curr = cv2.imread(current_path)

        if ref is None or curr is None:
            return ToolResult(
                tool_name="align_with_reference",
                success=False,
                observation="Failed to load one or both images",
            )

        result = self.engine.align_with_reference(ref, curr)

        observation = (
            f"Alignment: {result.status}, {result.matched_keypoints} keypoints, "
            f"inlier ratio={result.inlier_ratio:.1%}, "
            f"reprojection error={result.reprojection_error:.2f}px"
        )

        artifact = {
            "alignment": {
                "status": result.status,
                "matched_keypoints": result.matched_keypoints,
                "inlier_ratio": result.inlier_ratio,
                "reprojection_error": result.reprojection_error,
                "confidence": result.confidence,
                "reason": result.reason,
            }
        }

        # Save aligned image for next stage
        if result.aligned_image is not None:
            aligned_path = current_path.replace(".jpg", "_aligned.jpg").replace(".png", "_aligned.png")
            cv2.imwrite(aligned_path, result.aligned_image)
            artifact["aligned_image_path"] = aligned_path

        return ToolResult(
            tool_name="align_with_reference",
            success=result.status == "success" or result.status == "poor_quality",
            observation=observation,
            artifact=artifact,
            state_transition="analyzing",
        )

    def detect_visual_changes(
        self, reference_path: str, current_path: str, aligned_path: str | None = None
    ) -> ToolResult:
        """Detect visual changes between reference and current/aligned image."""
        import cv2

        ref = cv2.imread(reference_path)
        curr = cv2.imread(current_path)

        aligned = None
        aligned_mask = None
        if aligned_path:
            aligned = cv2.imread(aligned_path)
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

        regions = [
            {
                "bbox": [r.bbox_x, r.bbox_y, r.bbox_width, r.bbox_height],
                "area": r.area,
                "confidence": r.confidence,
                "mean_intensity": r.mean_intensity,
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
                }
            },
            state_transition="finding",
        )

    def generate_evidence(
        self,
        reference_path: str,
        current_path: str,
        aligned_path: str | None = None,
        diff_mask_path: str | None = None,
        detections: list[dict] | None = None,
        quality_issues: list[str] | None = None,
    ) -> ToolResult:
        """Generate evidence artifacts (annotated images, crops, comparisons)."""
        import cv2
        import numpy as np
        import json
        from app.vision.change_detection import ChangedRegion

        ref = cv2.imread(reference_path)
        curr = cv2.imread(current_path)

        if ref is None or curr is None:
            return ToolResult(
                tool_name="generate_evidence",
                success=False,
                observation="Failed to load images for evidence generation",
            )

        aligned = cv2.imread(aligned_path) if aligned_path else None
        diff_mask = cv2.imread(diff_mask_path, cv2.IMREAD_GRAYSCALE) if diff_mask_path else None

        regions = None
        if detections:
            h, w = ref.shape[:2]
            regions = [
                ChangedRegion(
                    bbox_x=d["bbox"][0] if isinstance(d["bbox"][0], float) else d["bbox"][0] / w,
                    bbox_y=d["bbox"][1] if isinstance(d["bbox"][1], float) else d["bbox"][1] / h,
                    bbox_width=d["bbox"][2] if isinstance(d["bbox"][2], float) else d["bbox"][2] / w,
                    bbox_height=d["bbox"][3] if isinstance(d["bbox"][3], float) else d["bbox"][3] / h,
                    area=d.get("area", 0),
                    mean_intensity=d.get("mean_intensity", 0.0),
                    confidence=d.get("confidence", 0.5),
                    description=d.get("description", ""),
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

        # Save evidence images to evidence directory
        import os
        evidence_dir = "storage/uploads/evidence"
        os.makedirs(evidence_dir, exist_ok=True)

        saved_paths = {}
        for category, images in {
            "annotated": evidence.annotated_images,
            "cropped": evidence.cropped_images,
            "comparison": evidence.comparison_overlays,
            "diff": evidence.diff_masks,
        }.items():
            for filename, data in images.items():
                path = os.path.join(evidence_dir, f"{category}_{filename}")
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
