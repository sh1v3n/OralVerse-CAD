from __future__ import annotations

from math import dist

from .catalog import ideal_pose, tooth_label

TRANSLATION_LIMIT_MM = 0.25
ROTATION_LIMIT_DEG = 2.0
VERTICAL_LIMIT_MM = 0.20


def create_movements(model: dict, analysis: dict) -> list[dict]:
    movements = []
    crowding = analysis["metrics"]["upper_crowding_mm"] + analysis["metrics"]["lower_crowding_mm"]
    for tooth in model["teeth"]:
        fdi = int(tooth["fdi"])
        target = ideal_pose(fdi)
        current_position = [float(v) for v in tooth["position"]]
        delta = [round(target["position"][i] - current_position[i], 3) for i in range(3)]
        rotation = round(target["rotation_deg"] - float(tooth.get("rotation_deg", 0)), 2)
        translation = round(dist(current_position, target["position"]), 3)
        vertical = delta[1]
        if translation < 0.03 and abs(rotation) < 0.4:
            continue

        attachment = recommend_attachment(fdi, translation, rotation, vertical)
        ipr = recommend_ipr(fdi, crowding, translation)
        risk_score = min(
            1.0,
            translation / 2.2 * 0.45 + abs(rotation) / 18 * 0.4 + abs(vertical) / 0.8 * 0.15,
        )
        movements.append({
            "fdi": fdi,
            "tooth_name": tooth_label(fdi),
            "start": {
                "position": current_position,
                "rotation_deg": float(tooth.get("rotation_deg", 0)),
            },
            "target": {
                "position": target["position"],
                "rotation_deg": target["rotation_deg"],
            },
            "total": {
                "translation": delta,
                "translation_mm": translation,
                "rotation_deg": rotation,
                "intrusion_mm": round(max(0.0, -vertical), 3),
                "extrusion_mm": round(max(0.0, vertical), 3),
            },
            "attachment": attachment,
            "ipr": ipr,
            "risk": {
                "score": round(risk_score, 2),
                "level": "high" if risk_score >= 0.7 else "moderate" if risk_score >= 0.4 else "low",
                "drivers": _risk_drivers(translation, rotation, vertical),
            },
        })
    return movements


def recommend_attachment(fdi: int, translation: float, rotation: float, vertical: float) -> dict | None:
    if abs(rotation) >= 8:
        return {
            "required": True,
            "type": "vertical rectangular",
            "surface": "buccal",
            "reason": f"rotation control ({abs(rotation):.1f} deg)",
        }
    if abs(vertical) >= 0.12:
        return {
            "required": True,
            "type": "horizontal beveled",
            "surface": "buccal",
            "reason": "vertical anchorage",
        }
    if translation >= 0.28 or fdi % 10 == 3:
        return {
            "required": True,
            "type": "optimized root control",
            "surface": "buccal",
            "reason": "translation and root control",
        }
    return None


def recommend_ipr(fdi: int, total_crowding: float, translation: float) -> dict | None:
    if total_crowding < 1.0 or fdi % 10 not in (1, 2, 3, 4):
        return None
    amount = min(0.3, max(0.1, total_crowding / 20 + translation / 10))
    neighbor = fdi + 1 if fdi % 10 < 4 else fdi - 1
    return {
        "between": [fdi, neighbor],
        "amount_mm": round(amount, 2),
        "stage": 3 if fdi < 30 else 4,
        "reason": "resolve anterior crowding while preserving arch form",
    }


def _risk_drivers(translation: float, rotation: float, vertical: float) -> list[str]:
    drivers = []
    if translation > 0.5:
        drivers.append("large translation")
    if abs(rotation) > 10:
        drivers.append("rotation tracking")
    if abs(vertical) > 0.18:
        drivers.append("vertical control")
    return drivers or ["routine tracking"]
