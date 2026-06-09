from __future__ import annotations

from uuid import uuid4

from .catalog import demo_model
from .constraints import validate_plan
from .geometry import analyze_geometry
from .movement import create_movements
from .prediction import predict_outcome
from .report import generate_report
from .staging import create_stages


def build_treatment_plan(model: dict | None = None) -> dict:
    source_model = model or demo_model()
    analysis = analyze_geometry(source_model)
    movements = create_movements(source_model, analysis)
    stages = create_stages(movements)
    prediction = predict_outcome(analysis, movements, stages)
    case_id = source_model.get("case_id") or uuid4().hex
    plan = {
        "id": f"plan-{case_id}",
        "case_id": case_id,
        "status": "draft_clinician_review",
        "source": source_model.get("source", "reconstructed_mesh"),
        "model": source_model,
        "analysis": analysis,
        "movements": movements,
        "stages": stages,
        "prediction": prediction,
        "constraints": {
            "max_translation_per_stage_mm": 0.25,
            "max_rotation_per_stage_deg": 2.0,
            "max_vertical_per_stage_mm": 0.2,
            "collision_clearance_mm": 0.1,
            "arch_form_preserved": True,
        },
    }
    plan["validation"] = validate_plan(source_model, stages)
    plan["report"] = generate_report(case_id, analysis, movements, stages, prediction)
    return plan
