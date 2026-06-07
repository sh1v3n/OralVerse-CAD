"""OCR over uploaded dental reports.

Supports PDFs (via pdf2image -> Tesseract), raster images (Tesseract), and
plain-text uploads (no OCR — useful for dev/testing without Tesseract or
poppler installed).

Tesseract: Windows install from https://github.com/UB-Mannheim/tesseract/wiki
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def _configure_tesseract_cmd() -> None:
    """Point pytesseract at the binary even if it isn't on PATH.

    Priority: explicit TESSERACT_CMD env var, then the standard UB-Mannheim
    Windows install path. A new shell would inherit the updated system PATH,
    but uvicorn processes started before the install won't — this bridges that.
    """
    import pytesseract

    explicit = os.environ.get("TESSERACT_CMD")
    if explicit and Path(explicit).exists():
        pytesseract.pytesseract.tesseract_cmd = explicit
        return

    if sys.platform == "win32":
        default = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
        if default.exists():
            pytesseract.pytesseract.tesseract_cmd = str(default)


def _resolve_poppler_path() -> str | None:
    """Find the directory containing pdftoppm.exe so pdf2image can run.

    Priority: explicit POPPLER_PATH env var, then the winget install location
    for oschwartz10612.Poppler. Returns None if not found, in which case
    pdf2image falls back to PATH lookup (works when poppler is on PATH).
    """
    explicit = os.environ.get("POPPLER_PATH")
    if explicit and Path(explicit).exists():
        return explicit

    if sys.platform == "win32":
        local_app = os.environ.get("LOCALAPPDATA")
        if local_app:
            winget_root = (
                Path(local_app)
                / "Microsoft" / "WinGet" / "Packages"
                / "oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe"
            )
            if winget_root.exists():
                # Version-stamped subdir (e.g. poppler-25.07.0); pick the newest.
                candidates = sorted(winget_root.glob("poppler-*/Library/bin"))
                if candidates:
                    return str(candidates[-1])
    return None


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return path.read_text(encoding="utf-8", errors="ignore")

    _configure_tesseract_cmd()
    import pytesseract
    from PIL import Image

    if suffix == ".pdf":
        from pdf2image import convert_from_path
        poppler_path = _resolve_poppler_path()
        pages = convert_from_path(str(path), dpi=200, poppler_path=poppler_path)
        return "\n\n".join(pytesseract.image_to_string(p) for p in pages)
    return pytesseract.image_to_string(Image.open(path))
