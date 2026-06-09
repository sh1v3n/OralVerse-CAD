from __future__ import annotations

from datetime import date


def generate_report(case_id: str, analysis: dict, movements: list[dict], stages: list[dict], prediction: dict) -> dict:
    issue_text = [
        f"{issue['severity'].title()} {issue['type'].replace('_', ' ')} "
        f"({issue['value']} {issue['unit']})"
        for issue in analysis["issues"]
    ]
    attachments = [
        {"fdi": m["fdi"], **m["attachment"]}
        for m in movements if m.get("attachment")
    ]
    ipr = []
    seen = set()
    for movement in movements:
        recommendation = movement.get("ipr")
        if not recommendation:
            continue
        key = tuple(sorted(recommendation["between"]))
        if key not in seen:
            seen.add(key)
            ipr.append(recommendation)

    return {
        "title": "AI Orthodontic Treatment Planning Report",
        "case_id": case_id,
        "generated_on": date.today().isoformat(),
        "status": "Draft for clinician review",
        "diagnosis_summary": issue_text,
        "movement_summary": {
            "teeth_moved": len(movements),
            "maximum_translation_mm": max((m["total"]["translation_mm"] for m in movements), default=0),
            "maximum_rotation_deg": max((abs(m["total"]["rotation_deg"]) for m in movements), default=0),
            "active_aligners": len([s for s in stages if s["kind"] == "active"]),
            "passive_aligners": len([s for s in stages if s["kind"] == "passive"]),
        },
        "attachment_plan": attachments,
        "ipr_plan": ipr,
        "stage_breakdown": stages,
        "duration": {
            "weeks": prediction["estimated_duration_weeks"],
            "months": prediction["estimated_duration_months"],
        },
        "risk_analysis": prediction["risk_teeth"],
        "refinement_prediction": prediction["refinement_probability"],
        "clinical_notice": (
            "Decision-support output only. Validate roots, periodontal limits, "
            "occlusion, TMJ status, and anchorage before appliance fabrication."
        ),
    }
