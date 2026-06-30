"""Deterministic staged treatment planner.

Accepts initial and target transforms for each tooth, computes the global
stage count from clinical constraints, and returns per-tooth per-stage
interpolated transforms.

The linear interpolation can be swapped for an ML-predicted path without
changing the API contract.

Clinical constraints (per aligner stage):
  - Translation  ≤ 0.25 mm
  - Rotation     ≤ 2.0°
  - Intrusion    ≤ 0.15 mm  (Y-axis vertical movement)
"""

from __future__ import annotations

from math import ceil, sqrt
from typing import Any

# ── Clinical limits ────────────────────────────────────────────────────────────

MAX_TRANSLATION_PER_STAGE_MM = 0.25
MAX_ROTATION_PER_STAGE_DEG = 2.0
MAX_INTRUSION_PER_STAGE_MM = 0.15
MIN_STAGES = 8


# ── Public API ─────────────────────────────────────────────────────────────────


def build_staged_plan(teeth: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a staged treatment plan from initial → target transforms.

    Parameters
    ----------
    teeth : list of dicts, each containing:
        - id: str           FDI number as string, e.g. "11"
        - initial: dict     { position: [x,y,z], rotation: [rx,ry,rz] }
        - target: dict      { position: [x,y,z], rotation: [rx,ry,rz] }

    Returns
    -------
    dict with keys:
        - totalStages: int
        - constraints: dict
        - teeth: dict mapping FDI → { initial, target, stages }
    """
    if not teeth:
        return {
            "totalStages": 0,
            "constraints": _constraints_dict(),
            "teeth": {},
        }

    # 1. Determine global stage count from the tooth that needs the most stages
    global_stages = MIN_STAGES
    for tooth in teeth:
        required = _required_stages(tooth["initial"], tooth["target"])
        global_stages = max(global_stages, required)

    # 2. Generate per-tooth staged transforms
    teeth_output: dict[str, Any] = {}
    for tooth in teeth:
        fdi = str(tooth["id"])
        initial = _normalize_transform(tooth["initial"])
        target = _normalize_transform(tooth["target"])
        stages = _interpolate_stages(initial, target, global_stages)
        teeth_output[fdi] = {
            "initial": initial,
            "target": target,
            "stages": stages,
        }

    return {
        "totalStages": global_stages,
        "constraints": _constraints_dict(),
        "teeth": teeth_output,
    }


# ── Internal helpers ───────────────────────────────────────────────────────────


def _constraints_dict() -> dict[str, float]:
    return {
        "max_translation_mm": MAX_TRANSLATION_PER_STAGE_MM,
        "max_rotation_deg": MAX_ROTATION_PER_STAGE_DEG,
        "max_intrusion_mm": MAX_INTRUSION_PER_STAGE_MM,
    }


def _normalize_transform(t: dict) -> dict:
    """Ensure transform has exactly position[3] and rotation[3] as floats."""
    pos = [float(v) for v in t.get("position", [0, 0, 0])]
    rot = [float(v) for v in t.get("rotation", [0, 0, 0])]
    # Pad to length 3 if needed
    while len(pos) < 3:
        pos.append(0.0)
    while len(rot) < 3:
        rot.append(0.0)
    return {"position": pos[:3], "rotation": rot[:3]}


def _required_stages(initial: dict, target: dict) -> int:
    """Compute how many stages this tooth needs given clinical limits."""
    ip = initial.get("position", [0, 0, 0])
    tp = target.get("position", [0, 0, 0])
    ir = initial.get("rotation", [0, 0, 0])
    tr = target.get("rotation", [0, 0, 0])

    # Translation distance (3D Euclidean)
    dx = float(tp[0]) - float(ip[0])
    dy = float(tp[1]) - float(ip[1])
    dz = float(tp[2]) - float(ip[2])
    translation_mm = sqrt(dx * dx + dy * dy + dz * dz)

    # Max rotation delta across any axis
    max_rotation_deg = max(
        abs(float(tr[i]) - float(ir[i])) for i in range(3)
    )

    # Vertical intrusion/extrusion (Y-axis)
    intrusion_mm = abs(dy)

    stages_translation = ceil(translation_mm / MAX_TRANSLATION_PER_STAGE_MM) if translation_mm > 0.01 else 0
    stages_rotation = ceil(max_rotation_deg / MAX_ROTATION_PER_STAGE_DEG) if max_rotation_deg > 0.1 else 0
    stages_intrusion = ceil(intrusion_mm / MAX_INTRUSION_PER_STAGE_MM) if intrusion_mm > 0.01 else 0

    return max(1, stages_translation, stages_rotation, stages_intrusion)


def _interpolate_stages(
    initial: dict,
    target: dict,
    total_stages: int,
) -> list[dict]:
    """Linear interpolation from initial to target over total_stages."""
    ip = initial["position"]
    tp = target["position"]
    ir = initial["rotation"]
    tr = target["rotation"]

    stages: list[dict] = []
    for s in range(1, total_stages + 1):
        t = s / total_stages  # 0..1
        pos = [round(ip[i] + (tp[i] - ip[i]) * t, 6) for i in range(3)]
        rot = [round(ir[i] + (tr[i] - ir[i]) * t, 4) for i in range(3)]
        stages.append({
            "stage": s,
            "transform": {
                "position": pos,
                "rotation": rot,
            },
        })

    return stages
