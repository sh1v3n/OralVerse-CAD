"""Routes for serving the local STL dental-scan dataset.

Endpoints
---------
GET /api/stl/cases
    Returns a JSON manifest of every case folder and its STL files,
    classified into upper_arch / lower_arch / articulated / other.

GET /api/stl/file/{case_name}/{filename}
    Streams the raw binary STL file.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/stl", tags=["stl_dataset"])

# Resolve the dataset directory relative to the project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_DATASET_DIR = _PROJECT_ROOT / "datasets" / "data"


def _classify_file(filename: str) -> str:
    """Heuristic classification of an STL file within a case folder.

    Naming conventions observed in this dataset:
      Articulated_Casts/  0A, 0B, 0C, 1A, 1B, 1C
      Case folders/       0A-I, 0B-II, 1A-III, 2-I, 3-II  (some with -excluded)

    Classification logic:
      '0A' prefix  →  upper_arch
      '0B' prefix  →  lower_arch
      '0C' / '1C'  →  articulated
      '1A' prefix  →  upper_segment
      '1B' prefix  →  lower_segment
      '2' / '3'    →  other / accessory
    """
    stem = Path(filename).stem  # e.g. '0A-I' or '0B-III-excluded'

    if stem.startswith("0A"):
        return "upper_arch"
    if stem.startswith("0B"):
        return "lower_arch"
    if stem.endswith("C") and stem[0].isdigit():
        return "articulated"
    if stem.startswith("1A"):
        return "upper_segment"
    if stem.startswith("1B"):
        return "lower_segment"
    return "other"


def _is_excluded(filename: str) -> bool:
    return "excluded" in Path(filename).stem.lower()


def _scan_manifest(include_excluded: bool = False) -> list[dict[str, Any]]:
    """Walk the dataset directory and build a manifest of cases."""
    if not _DATASET_DIR.is_dir():
        return []

    cases: list[dict[str, Any]] = []

    for entry in sorted(_DATASET_DIR.iterdir()):
        if not entry.is_dir():
            continue

        scans: list[dict[str, Any]] = []
        for stl_file in sorted(entry.glob("*.stl")):
            excluded = _is_excluded(stl_file.name)
            if excluded and not include_excluded:
                continue
            scans.append({
                "filename": stl_file.name,
                "size_bytes": stl_file.stat().st_size,
                "category": _classify_file(stl_file.name),
                "excluded": excluded,
            })

        cases.append({
            "id": entry.name,
            "label": entry.name.replace("_", " "),
            "scan_count": len(scans),
            "scans": scans,
        })

    return cases


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/cases")
def list_cases(
    include_excluded: bool = Query(False, description="Include scans marked as excluded"),
) -> list[dict[str, Any]]:
    """Return a manifest of all available STL cases."""
    return _scan_manifest(include_excluded)


@router.get("/file/{case_name}/{filename}")
def get_stl_file(case_name: str, filename: str) -> FileResponse:
    """Stream a single STL file."""
    # Sanitise inputs to prevent directory traversal
    safe_case = re.sub(r"[^A-Za-z0-9_\-]", "", case_name)
    safe_file = re.sub(r"[^A-Za-z0-9_\-.]", "", filename)

    path = _DATASET_DIR / safe_case / safe_file
    if not path.is_file():
        raise HTTPException(404, f"STL file not found: {safe_case}/{safe_file}")

    return FileResponse(
        path,
        media_type="application/sla",
        filename=safe_file,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Expose-Headers": "Content-Length",
        },
    )
