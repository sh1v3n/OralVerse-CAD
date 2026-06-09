from __future__ import annotations


def predict_outcome(analysis: dict, movements: list[dict], stages: list[dict]) -> dict:
    high_risk = [m for m in movements if m["risk"]["level"] == "high"]
    moderate_risk = [m for m in movements if m["risk"]["level"] == "moderate"]
    max_rotation = max((abs(m["total"]["rotation_deg"]) for m in movements), default=0)
    total_ipr = sum(
        m["ipr"]["amount_mm"] for m in movements if m.get("ipr")
    )
    refinement = min(
        0.72,
        0.12
        + len(high_risk) * 0.08
        + len(moderate_risk) * 0.025
        + max(0, max_rotation - 8) * 0.012,
    )
    active_days = sum(stage["wear_days"] for stage in stages)
    return {
        "estimated_duration_weeks": round(active_days / 7),
        "estimated_duration_months": round(active_days / 30.4, 1),
        "refinement_probability": round(refinement, 2),
        "tracking_confidence": round(max(0.58, 0.94 - refinement * 0.35), 2),
        "total_ipr_mm": round(total_ipr, 2),
        "risk_teeth": [
            {"fdi": m["fdi"], **m["risk"]}
            for m in sorted(movements, key=lambda item: item["risk"]["score"], reverse=True)[:6]
        ],
        "assumptions": [
            "10-day active aligner wear with at least 22 hours/day compliance",
            "Healthy periodontal support and no active pathology",
            "Root positions and bone envelope require CBCT/clinical validation",
            "Final plan requires orthodontist approval",
        ],
    }
