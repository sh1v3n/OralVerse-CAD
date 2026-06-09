from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.orthodontics import build_treatment_plan
from ai.orthodontics.reasoning import answer_with_local_llm

router = APIRouter(prefix="/api/orthodontics", tags=["orthodontics"])


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


@router.get("/demo-plan")
def demo_plan() -> dict:
    return build_treatment_plan()


@router.post("/plan")
def generate_plan(model: ModelInput) -> dict:
    return build_treatment_plan(model.model_dump())


@router.post("/copilot")
def copilot(payload: CopilotInput) -> dict:
    return answer_with_local_llm(payload.question, payload.plan)
