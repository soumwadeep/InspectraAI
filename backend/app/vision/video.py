"""Video frame sampling with measured per-frame statistics.

A video input used to reach the image pipeline directly: `cv2.imread` returns None
for an .mp4, the quality tool reported "Failed to load image", and the run failed
with a message that made no sense for a file the upload endpoint had accepted.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.vision.errors import VisionInputError
from app.vision.ssim import compute_ssim


@dataclass
class FrameSample:
    frame_index: int
    timestamp_ms: int
    storage_path: str
    blur_score: float
    mean_abs_diff: float
    ssim_score: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _laplacian_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def sample_frames(
    video_path: str,
    reference_path: str,
    output_dir: str,
    max_frames: int = 12,
) -> dict[str, Any]:
    """Decode evenly spaced frames and measure each one against the reference.

    Every number returned is computed from the decoded pixels: sharpness is the
    Laplacian variance, `mean_abs_diff` and `ssim_score` compare the frame with the
    reference image after scaling to the reference geometry.
    """
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        raise VisionInputError(f"Could not decode video at {video_path}")

    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    reference = cv2.imread(reference_path)
    if reference is None:
        raise VisionInputError(f"Could not read reference image at {reference_path}")
    ref_h, ref_w = reference.shape[:2]
    ref_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)

    if total_frames <= 0:
        # Some containers report no frame count. Read until the decoder stops so
        # the sample count reflects the video rather than a guessed constant.
        indices: list[int] = []
        step = max(1, int(round((fps or 25.0) * 2.0)))
        position = 0
        while len(indices) < max_frames:
            capture.set(cv2.CAP_PROP_POS_FRAMES, position)
            ok, frame = capture.read()
            if not ok:
                break
            indices.append(position)
            position += step
    else:
        count = min(max_frames, total_frames)
        indices = [
            int(round(i * (total_frames - 1) / max(count - 1, 1))) if count > 1 else 0
            for i in range(count)
        ]

    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)

    samples: list[FrameSample] = []
    for index in indices:
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok or frame is None:
            continue

        resized = cv2.resize(frame, (ref_w, ref_h))
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        diff = float(cv2.absdiff(gray, ref_gray).mean())
        ssim, _ = compute_ssim(gray, ref_gray)

        path = directory / f"frame_{index:06d}.png"
        cv2.imwrite(str(path), resized)

        timestamp_ms = int(round(index * 1000.0 / fps)) if fps else 0
        samples.append(FrameSample(
            frame_index=index,
            timestamp_ms=timestamp_ms,
            # Relative to the storage root so the path is servable.
            storage_path=str(path),
            blur_score=round(_laplacian_variance(gray), 2),
            mean_abs_diff=round(diff, 3),
            ssim_score=round(float(ssim), 4),
        ))

    capture.release()

    if not samples:
        raise VisionInputError(f"No frames could be decoded from {video_path}")

    sharpest = max(samples, key=lambda s: s.blur_score)
    return {
        "frames_requested": len(indices),
        "frames_decoded": len(samples),
        "container_frame_count": total_frames,
        "fps": round(fps, 3),
        "width": width,
        "height": height,
        "samples": [s.to_dict() for s in samples],
        "selected_frame_index": sharpest.frame_index,
        "selected_frame_path": sharpest.storage_path,
        "selection_reason": (
            "highest measured Laplacian variance "
            f"({sharpest.blur_score} over {len(samples)} sampled frames)"
        ),
    }
