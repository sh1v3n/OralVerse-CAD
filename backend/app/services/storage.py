"""Local filesystem storage. Swap for Supabase Storage when ready."""
from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

STORAGE_ROOT = Path(__file__).resolve().parents[3] / "storage" / "uploads"
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def save_upload(file: UploadFile) -> tuple[str, Path]:
    image_id = uuid4().hex
    suffix = Path(file.filename or "image.png").suffix or ".png"
    dst = STORAGE_ROOT / f"{image_id}{suffix}"
    with dst.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return image_id, dst
