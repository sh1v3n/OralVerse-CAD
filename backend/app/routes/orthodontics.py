from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.orthodontics import build_treatment_plan
from ai.orthodontics.segmentation import DentalMesh, SegmentationResult, get_segmenter
from ai.orthodontics.staged_planner import build_staged_plan
from ai.orthodontics.reasoning import answer_with_local_llm

router = APIRouter(prefix="/api/orthodontics", tags=["orthodontics"])


# ── Pydantic models for the new staged-plan endpoint ───────────────────────────


class StagedToothTransform(BaseModel):
    position: list[float] = Field(min_length=3, max_length=3)
    rotation: list[float] = Field(min_length=3, max_length=3)


class StagedToothInput(BaseModel):
    id: str
    initial: StagedToothTransform
    target: StagedToothTransform


class StagedPlanInput(BaseModel):
    teeth: list[StagedToothInput]


# ── Pydantic models for the legacy plan endpoint ──────────────────────────────


class ToothPose(BaseModel):
    fdi: int
    position: list[float] = Field(min_length=3, max_length=3)
    rotation_deg: float = 0
    confidence: float = Field(default=1, ge=0, le=1)


class BiteMetrics(BaseModel):
    overjet_mm: float = 2.5
    overbite_percent: float = 30
    midline_deviation_mm: float = 0


class ModelInput(BaseModel):
    case_id: str | None = None
    source: str = "reconstructed_mesh"
    teeth: list[ToothPose]
    bite: BiteMetrics = Field(default_factory=BiteMetrics)


class CopilotInput(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    plan: dict


class SegmentPayload(BaseModel):
    vertices: list[list[float]]  # (N, 3) — vertex positions in mm
    faces: list[list[int]]       # (M, 3) — face indices into vertices
    arch: str = Field(pattern="^(upper|lower)$")


# ── Helpers ────────────────────────────────────────────────────────────────────


def _result_to_dict(result: SegmentationResult) -> dict:
    return {
        "segments": [
            {
                "fdi": seg.fdi,
                "face_mask": np.where(seg.face_mask)[0].tolist(),
                "confidence": float(seg.confidence),
                "centroid": seg.centroid.tolist(),
            }
            for seg in result.segments
        ],
        "gingiva_faces": np.where(result.gingiva_mask)[0].tolist(),
        "model": result.model,
        "duration_ms": result.duration_ms,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post("/staged-plan")
def staged_plan(payload: StagedPlanInput) -> dict:
    """Generate a clinically-constrained staged treatment plan.

    Accepts initial and target transforms for each tooth and returns
    per-stage interpolated transforms respecting movement limits.
    """
    teeth_dicts = [t.model_dump() for t in payload.teeth]
    return build_staged_plan(teeth_dicts)


@router.get("/demo-plan")
def demo_plan() -> dict:
    return build_treatment_plan()


@router.post("/plan")
def generate_plan(model: ModelInput) -> dict:
    return build_treatment_plan(model.model_dump())


@router.post("/copilot")
def copilot(payload: CopilotInput) -> dict:
    return answer_with_local_llm(payload.question, payload.plan)


@router.post("/segment")
def segment_arch(payload: SegmentPayload) -> dict:
    """Segment a monolithic arch mesh into individual teeth + gingiva.

    The segmenter implementation is selected by the ORALVERSE_SEGMENTER env var
    (default: "heuristic").  The caller only needs to send raw vertices and faces
    and receives per-tooth face indices, FDI labels, and confidence scores.
    """
    mesh = DentalMesh(
        vertices=np.array(payload.vertices, dtype=np.float32),
        faces=np.array(payload.faces, dtype=np.int32),
        arch=payload.arch,
    )
    segmenter = get_segmenter()
    result = segmenter.segment(mesh)
    return _result_to_dict(result)
