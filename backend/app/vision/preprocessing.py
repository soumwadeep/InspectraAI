"""Image preprocessing: decoding, color conversion, resize, enhancement, morphology."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np


@dataclass
class ImagePreprocessingConfig:
    """Configuration for the preprocessing pipeline (recorded for reproducibility)."""
    resize_width: Optional[int] = None
    resize_height: Optional[int] = None
    apply_denoise: bool = True
    denoise_strength: float = 10.0
    apply_clahe: bool = True
    clahe_clip_limit: float = 2.0
    clahe_tile_grid: tuple[int, int] = (8, 8)
    apply_edge_detection: bool = False
    canny_threshold1: float = 50.0
    canny_threshold2: float = 150.0
    apply_adaptive_threshold: bool = False
    adaptive_block_size: int = 11
    adaptive_c: float = 2.0
    morphological_kernel_size: int = 3
    morphological_operation: str = "open"  # open, close, gradient, erode, dilate


@dataclass
class PreprocessingResult:
    """Result of preprocessing, with metadata for reproducibility."""
    original: np.ndarray
    processed: np.ndarray
    gray: np.ndarray
    edges: Optional[np.ndarray] = None
    diff_mask: Optional[np.ndarray] = None
    config: ImagePreprocessingConfig = field(default_factory=ImagePreprocessingConfig)
    width: int = 0
    height: int = 0
    channels: int = 3
    dtype: str = "uint8"


def decode_image(raw_bytes: bytes) -> np.ndarray:
    """Decode an image from raw bytes to a 3-channel BGR array.

    IMREAD_UNCHANGED was used before, which returns 4 channels for any PNG with
    an alpha channel — a plain phone screenshot — and the later
    ``cvtColor(BGR2GRAY)``/``BGR2HSV`` calls then raised and surfaced as a 500.
    """
    if not raw_bytes:
        raise ValueError("Empty upload — no image bytes to decode")
    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image — possibly corrupt or unsupported format")
    return img


def correct_orientation(image: np.ndarray) -> np.ndarray:
    """Apply EXIF orientation correction using PIL for metadata, then back to BGR."""
    from PIL import Image
    import io

    # If image is grayscale, no orientation needed
    if len(image.shape) == 2:
        return image

    # Encode and use PIL to handle EXIF orientation
    _, buffer = cv2.imencode(".png", image)
    pil_img = Image.open(io.BytesIO(buffer.tobytes()))
    pil_img = ImageOps_exif_transpose(pil_img)
    arr = np.array(pil_img)
    if len(arr.shape) == 2:
        return arr
    # Convert RGB back to BGR for OpenCV
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def ImageOps_exif_transpose(img):
    """Manual EXIF transposition (avoids pillow-heif dependency issues)."""
    from PIL import ImageOps, ExifTags

    try:
        exif = img.getexif()
    except Exception:
        exif = None
    if not exif:
        return img

    orientation = exif.get(ExifTags.Base.Orientation, 1)
    if orientation == 1:
        return img
    return ImageOps.exif_transpose(img)


def preprocess_image(
    image: np.ndarray,
    config: Optional[ImagePreprocessingConfig] = None,
) -> PreprocessingResult:
    """
    Run the preprocessing pipeline on a decoded image.

    Steps:
    1. Optional resize
    2. Color conversion (BGR -> Gray, BGR -> LAB for CLAHE)
    3. Denoising (bilateral or Gaussian)
    4. Contrast enhancement (CLAHE)
    5. Edge detection (Canny)
    6. Adaptive thresholding
    7. Morphological operations
    """
    if config is None:
        config = ImagePreprocessingConfig()

    original = image.copy()
    h, w = image.shape[:2]
    channels = image.shape[2] if len(image.shape) == 3 else 1

    # Step 1: Resize if specified
    if config.resize_width or config.resize_height:
        new_w = config.resize_width or w
        new_h = config.resize_height or h
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

    h, w = image.shape[:2]

    # Step 2: Convert to grayscale
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    processed = image.copy()

    # Step 3: Denoising
    if config.apply_denoise:
        if len(processed.shape) == 3:
            processed = cv2.bilateralFilter(
                processed, d=9, sigmaColor=config.denoise_strength * 3,
                sigmaSpace=config.denoise_strength
            )
        else:
            processed = cv2.bilateralFilter(
                processed, d=9, sigmaColor=config.denoise_strength * 3,
                sigmaSpace=config.denoise_strength
            )

    # Step 4: CLAHE contrast enhancement
    if config.apply_clahe:
        clahe = cv2.createCLAHE(
            clipLimit=config.clahe_clip_limit,
            tileGridSize=config.clahe_tile_grid
        )
        if len(processed.shape) == 3:
            # Apply CLAHE to each channel (or convert to LAB)
            lab = cv2.cvtColor(processed, cv2.COLOR_BGR2LAB)
            l_channel = lab[:, :, 0]
            l_channel = clahe.apply(l_channel)
            lab[:, :, 0] = l_channel
            processed = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        else:
            processed = clahe.apply(processed)

    # Step 5: Edge detection
    edges = None
    if config.apply_edge_detection:
        edges = cv2.Canny(
            cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY) if len(processed.shape) == 3
            else processed,
            config.canny_threshold1, config.canny_threshold2
        )

    # Step 6: Adaptive thresholding
    if config.apply_adaptive_threshold:
        if len(processed.shape) == 3:
            gray_proc = cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY)
        else:
            gray_proc = processed
        gray_proc = cv2.GaussianBlur(gray_proc, (3, 3), 0)
        thresholded = cv2.adaptiveThreshold(
            gray_proc, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            config.adaptive_block_size,
            config.adaptive_c
        )

    # Step 7: Morphological operations on gray
    if config.morphological_kernel_size > 0:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (config.morphological_kernel_size, config.morphological_kernel_size)
        )
        morph_map = {
            "open": cv2.MORPH_OPEN,
            "close": cv2.MORPH_CLOSE,
            "gradient": cv2.MORPH_GRADIENT,
            "erode": cv2.MORPH_ERODE,
            "dilate": cv2.MORPH_DILATE,
        }
        morph_op = morph_map.get(config.morphological_operation, cv2.MORPH_OPEN)
        gray = cv2.morphologyEx(gray, morph_op, kernel)

    return PreprocessingResult(
        original=original,
        processed=processed,
        gray=gray,
        edges=edges,
        config=config,
        width=w,
        height=h,
        channels=channels,
        dtype=str(image.dtype),
    )
