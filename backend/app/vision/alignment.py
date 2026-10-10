"""Reference image alignment using ORB + RANSAC + homography."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np


@dataclass
class AlignmentResult:
    """Result of image alignment against a reference."""
    status: str  # success | failed | insufficient_features | poor_quality
    matched_keypoints: int
    inlier_ratio: float
    reprojection_error: float
    homography: Optional[np.ndarray]
    aligned_image: Optional[np.ndarray]
    aligned_mask: Optional[np.ndarray]
    confidence: float
    reason: str


@dataclass
class AlignmentConfig:
    """Configurable parameters for ORB alignment."""
    nfeatures: int = 2000
    scale_factor: float = 1.2
    nlevels: int = 8
    edge_threshold: int = 31
    patch_size: int = 31
    min_matches: int = 10
    reproj_threshold: float = 3.0
    min_inlier_ratio: float = 0.7


class ReferenceAligner:
    """Aligns an input image to a reference using ORB features + RANSAC homography."""

    def __init__(self, config: Optional[AlignmentConfig] = None):
        self.config = config or AlignmentConfig()

    def _create_orb(self) -> cv2.ORB:
        return cv2.ORB_create(
            nfeatures=self.config.nfeatures,
            scaleFactor=self.config.scale_factor,
            nlevels=self.config.nlevels,
            edgeThreshold=self.config.edge_threshold,
            patchSize=self.config.patch_size,
            fastThreshold=20,
        )

    def _extract_features(self, image: np.ndarray) -> tuple[list, np.ndarray]:
        """Detect ORB keypoints and compute descriptors."""
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        gray = cv2.equalizeHist(gray)
        orb = self._create_orb()
        keypoints = orb.detect(gray, None)
        keypoints, descriptors = orb.compute(gray, keypoints)
        if descriptors is None:
            descriptors = np.array([])
        return keypoints, descriptors

    def _match_features(self, desc1: np.ndarray, desc2: np.ndarray) -> list:
        """Match ORB descriptors using BFMatcher with Hamming distance."""
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        if len(desc1) == 0 or len(desc2) == 0:
            return []
        matches = bf.match(desc1, desc2)
        matches = sorted(matches, key=lambda m: m.distance)
        # Filter top matches: keep those within 2x of best distance
        if matches:
            min_dist = matches[0].distance
            matches = [m for m in matches if m.distance <= max(3 * min_dist, 30)]
        return matches

    def align(
        self,
        reference: np.ndarray,
        input_image: np.ndarray,
    ) -> AlignmentResult:
        """
        Align input_image to reference_image using ORB + RANSAC homography.

        Rejects unreliable transformations and returns structured results.
        """
        kp1, desc1 = self._extract_features(reference)
        kp2, desc2 = self._extract_features(input_image)

        matches = self._match_features(desc1, desc2)

        if len(matches) < self.config.min_matches:
            return AlignmentResult(
                status="insufficient_features",
                matched_keypoints=len(matches),
                inlier_ratio=0.0,
                reprojection_error=float("inf"),
                homography=None,
                aligned_image=None,
                aligned_mask=None,
                confidence=0.0,
                reason=f"Only {len(matches)} feature matches (need {self.config.min_matches})",
            )

        # Extract matched point coordinates
        src_pts = np.float32([kp1[m.queryIdx].pt for m in matches])
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches])

        # Compute homography using RANSAC
        homography, mask = cv2.findHomography(
            dst_pts, src_pts, cv2.RANSAC, self.config.reproj_threshold
        )

        if homography is None:
            return AlignmentResult(
                status="failed",
                matched_keypoints=len(matches),
                inlier_ratio=0.0,
                reprojection_error=float("inf"),
                homography=None,
                aligned_image=None,
                aligned_mask=None,
                confidence=0.0,
                reason="Homography estimation failed (RANSAC found no consensus set)",
            )

        # Inlier analysis
        inliers = mask.flatten() if mask is not None else np.ones(len(matches), dtype=np.uint8)
        inlier_count = int(inliers.sum())
        inlier_ratio = inlier_count / len(matches)

        # Compute reprojection error for inliers
        if homography is not None and len(src_pts) > 0:
            dst_pts_transformed = cv2.perspectiveTransform(dst_pts.reshape(-1, 1, 2), homography)
            errors = np.sqrt(np.sum((dst_pts_transformed.reshape(-1, 2) - src_pts) ** 2, axis=1))
            reproj_error = float(errors[inliers.astype(bool)].mean()) if inlier_count > 0 else float("inf")
        else:
            reproj_error = float("inf")

        # Warp input image to reference frame
        h_ref, w_ref = reference.shape[:2]
        aligned = cv2.warpPerspective(input_image, homography, (w_ref, h_ref))

        # Create aligned mask (valid region of warped image)
        mask_aligned = np.zeros((h_ref, w_ref), dtype=np.uint8)
        mask_aligned = cv2.warpPerspective(
            np.ones((input_image.shape[0], input_image.shape[1]), dtype=np.uint8) * 255,
            homography, (w_ref, h_ref)
        )

        # Confidence based on inlier ratio and reprojection error
        confidence = inlier_ratio
        if reproj_error < 5.0:
            confidence *= 1.0
        elif reproj_error < 15.0:
            confidence *= 0.7
        else:
            confidence *= 0.3

        confidence = float(np.clip(confidence, 0.0, 1.0))

        if inlier_ratio < self.config.min_inlier_ratio:
            status = "poor_quality"
            reason = f"Low inlier ratio ({inlier_ratio:.2%}) — viewpoint too different"
        else:
            status = "success"
            reason = ""

        return AlignmentResult(
            status=status,
            matched_keypoints=len(matches),
            inlier_ratio=inlier_ratio,
            reprojection_error=reproj_error,
            homography=homography,
            aligned_image=aligned,
            aligned_mask=mask_aligned,
            confidence=confidence,
            reason=reason,
        )
