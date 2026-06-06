"""OCR over uploaded dental reports.

Supports PDFs (via pdf2image -> Tesseract) and raster images.
Requires the Tesseract binary on PATH (Windows: install from
https://github.com/UB-Mannheim/tesseract/wiki).
"""
from __future__ import annotations

from pathlib import Path


def extract_text(path: Path) -> str:
    import pytesseract
    from PIL import Image

    if path.suffix.lower() == ".pdf":
        from pdf2image import convert_from_path
        pages = convert_from_path(str(path), dpi=200)
        return "\n\n".join(pytesseract.image_to_string(p) for p in pages)
    return pytesseract.image_to_string(Image.open(path))
