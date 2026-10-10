"""Storage abstraction: local disk with optional S3 backend."""
from __future__ import annotations

import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import UploadFile
from PIL import Image

from app.config import settings

UPLOAD_DIR = Path("storage/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR = UPLOAD_DIR / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAIL_DIR = UPLOAD_DIR / "thumbnails"
THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".avi", ".mov"}
MAX_FILE_SIZE_BYTES = settings.max_upload_mb * 1024 * 1024


class StorageService:
    """Handles file upload, validation, thumbnail generation, and retrieval."""

    @staticmethod
    def validate_image(file: UploadFile) -> tuple[bool, str]:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return False, f"Unsupported image format: {ext}. Allowed: {ALLOWED_IMAGE_EXTENSIONS}"
        return True, "Valid"

    @staticmethod
    def validate_video(file: UploadFile) -> tuple[bool, str]:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_VIDEO_EXTENSIONS:
            return False, f"Unsupported video format: {ext}. Allowed: {ALLOWED_VIDEO_EXTENSIONS}"
        return True, "Valid"

    @staticmethod
    def save_image(file: UploadFile, subdir: str = "inspections") -> str:
        """Save an uploaded image to local disk, return relative path."""
        ext = Path(file.filename or "").suffix.lower()
        filename = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
        save_dir = UPLOAD_DIR / subdir
        save_dir.mkdir(parents=True, exist_ok=True)
        dest = save_dir / filename

        # Stream-write the file
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        # Generate thumbnail
        try:
            with Image.open(str(dest)) as img:
                img.thumbnail((256, 256))
                thumb_path = THUMBNAIL_DIR / filename
                img.save(str(thumb_path))
        except Exception:
            pass

        return str(dest.relative_to(UPLOAD_DIR.parent))

    @staticmethod
    def save_evidence(file: UploadFile, inspection_id: str) -> str:
        """Save an evidence image (annotated, cropped, comparison) for a finding."""
        ext = Path(file.filename or "").suffix.lower()
        filename = f"{uuid.uuid4().hex}{ext}"
        dest = EVIDENCE_DIR / inspection_id / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfileobj(file.file, dest)
        return str(dest)

    @staticmethod
    def get_image_path(relative_path: str) -> Optional[Path]:
        """Get the full path for a stored image."""
        full = UPLOAD_DIR.parent / relative_path
        if full.exists():
            return full
        return None

    @staticmethod
    def generate_thumbnail(source_path: str, size: tuple[int, int] = (256, 256)) -> str:
        """Generate and return a thumbnail path for a source image."""
        try:
            with Image.open(source_path) as img:
                img.thumbnail(size)
                thumb_name = Path(source_path).name
                thumb_path = THUMBNAIL_DIR / thumb_name
                img.save(str(thumb_path))
                return str(thumb_path)
        except Exception:
            return source_path

    @staticmethod
    def read_image_as_bytes(path: str) -> Optional[bytes]:
        """Read a stored image file and return its raw bytes."""
        full = UPLOAD_DIR.parent / path
        if full.exists():
            return full.read_bytes()
        # Also check evidence dir
        if EVIDENCE_DIR.joinpath(path).exists():
            return EVIDENCE_DIR.joinpath(path).read_bytes()
        return None
