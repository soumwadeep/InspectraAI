"""Vision processing endpoints: quality analysis, alignment, change detection on-demand."""
from __future__ import annotations

import os
import tempfile

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.dependencies import get_current_user, get_current_organization_id, get_db
from app.core.storage import StorageService
from app.vision.engine import VisionEngine
from app.vision.preprocessing import decode_image
from app.vision.quality import QualityMetrics

from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/vision", tags=["vision"])


@router.post("/quality", response_model=dict)
async def analyze_quality(
    file: UploadFile = File(...),
    db:Session = Depends(get_db),
    current_user=Depends(get_current_user),
    org_id: str = Depends(get_current_organization_id),
):
    """Analyze the quality of an uploaded image (blur, exposure, glare, coverage)."""
    valid, msg = StorageService.validate_image(file)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    contents = await file.read()
    try:
        img = decode_image(contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    engine = VisionEngine()
    metrics = engine.analyze_image_quality(img)

    return {
        "quality": {
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
    }


@router.post("/align", response_model=dict)
async def align_images(
    reference: UploadFile = File(...),
    image: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Align an image to a reference using ORB + RANSAC homography."""
    ref_bytes = await reference.read()
    img_bytes = await image.read()

    try:
        ref = decode_image(ref_bytes)
        curr = decode_image(img_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    engine = VisionEngine()
    result = engine.align_with_reference(ref, curr)

    response = {
        "status": result.status,
        "matched_keypoints": result.matched_keypoints,
        "inlier_ratio": result.inlier_ratio,
        "reprojection_error": result.reprojection_error,
        "confidence": result.confidence,
        "reason": result.reason,
    }

    # Include aligned image as base64 if available
    if result.aligned_image is not None:
        _, buffer = cv2.imencode(".png", result.aligned_image)
        import base64
        response["aligned_image"] = base64.b64encode(buffer.tobytes()).decode("utf-8")

    return response


@router.post("/compare", response_model=dict)
async def compare_images(
    reference: UploadFile = File(...),
    image: UploadFile = File(...),
    diff_threshold: float = 25.0,
    current_user=Depends(get_current_user),
):
    """Compare two images pixel-by-pixel and via SSIM. Returns changed regions."""
    ref_bytes = await reference.read()
    img_bytes = await image.read()

    try:
        ref = decode_image(ref_bytes)
        curr = decode_image(img_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    engine = VisionEngine()
    result = engine.detect_visual_changes(ref, curr)

    return {
        "status": result.status,
        "num_changed_regions": result.num_changed_regions,
        "total_changed_area": result.total_changed_area,
        "ssim_score": result.ssim_score,
        "mean_abs_diff": result.mean_abs_diff,
        "change_fraction": result.change_fraction,
        "regions": [
            {
                "bbox": [r.bbox_x, r.bbox_y, r.bbox_width, r.bbox_height],
                "area_px": r.area,
                "confidence": r.confidence,
                "mean_intensity": r.mean_intensity,
                "description": r.description,
            }
            for r in result.regions
        ],
    }


@router.post("/inspect", response_model=dict)
async def full_inspection(
    reference: UploadFile = File(...),
    image: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Run the complete inspection pipeline on two images.

    Returns quality metrics, alignment, change detection, and evidence.
    """
    ref_bytes = await reference.read()
    img_bytes = await image.read()

    try:
        ref = decode_image(ref_bytes)
        curr = decode_image(img_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    engine = VisionEngine()
    result = engine.inspect(reference_image=ref, input_image=curr)

    response = {
        "quality": {
            "blur_score": result.quality_metrics.blur_score,
            "exposure_score": result.quality_metrics.exposure_score,
            "glare_estimate": result.quality_metrics.glare_estimate,
            "image_coverage": result.quality_metrics.image_coverage,
            "inspection_suitability": result.quality_metrics.inspection_suitability,
            "reasons": result.quality_metrics.reasons,
        },
        "alignment": {
            "status": result.alignment_result.status,
            "matched_keypoints": result.alignment_result.matched_keypoints,
            "inlier_ratio": result.alignment_result.inlier_ratio,
            "reprojection_error": result.alignment_result.reprojection_error,
            "confidence": result.alignment_result.confidence,
            "reason": result.alignment_result.reason,
        },
        "change_detection": {
            "status": result.change_detection.status,
            "num_changed_regions": result.change_detection.num_changed_regions,
            "ssim_score": result.change_detection.ssim_score,
            "mean_abs_diff": result.change_detection.mean_abs_diff,
            "change_fraction": result.change_detection.change_fraction,
            "regions": [
                {
                    "bbox": [r.bbox_x, r.bbox_y, r.bbox_width, r.bbox_height],
                    "area_px": r.area,
                    "confidence": r.confidence,
                }
                for r in result.change_detection.regions
            ],
        },
        "detections": result.detections,
        "anomalies": result.anomalies,
        "recommendations": result.recommendations,
        "overall_confidence": result.overall_confidence,
        "processing_time_ms": result.processing_time_ms,
    }

    # Encode evidence images as base64
    for category in ["annotated", "cropped", "comparison", "diff"]:
        evidence_dict = getattr(result.evidence, {
            "annotated": "annotated_images",
            "cropped": "cropped_images",
            "comparison": "comparison_overlays",
            "diff": "diff_masks",
        }[category])
        encoded = {}
        for filename, data in evidence_dict.items():
            import base64
            encoded[filename] = base64.b64encode(data).decode("utf-8")
        if encoded:
            response.setdefault("evidence", {})[category] = encoded

    return response
