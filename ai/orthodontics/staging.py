from __future__ import annotations

from math import ceil

from .movement import ROTATION_LIMIT_DEG, TRANSLATION_LIMIT_MM, VERTICAL_LIMIT_MM


def create_stages(movements: list[dict], passive_stages: int = 2) -> list[dict]:
    required = 1
    for movement in movements:
        total = movement["total"]
        required = max(
            required,
            ceil(total["translation_mm"] / TRANSLATION_LIMIT_MM),
            ceil(abs(total["rotation_deg"]) / ROTATION_LIMIT_DEG),
            ceil((total["intrusion_mm"] + total["extrusion_mm"]) / VERTICAL_LIMIT_MM),
        )
    active_stages = max(10, required + 4)
    stages = []
    for number in range(1, active_stages + passive_stages + 1):
        active = number <= active_stages
        stage_movements = []
        for movement in movements:
            if not active:
                continue
            total = movement["total"]
            delta = [round(v / active_stages, 3) for v in total["translation"]]
            rotation = round(total["rotation_deg"] / active_stages, 2)
            vertical = delta[1]
            if max(abs(v) for v in delta) < 0.002 and abs(rotation) < 0.05:
                continue
            stage_movements.append({
                "fdi": movement["fdi"],
                "translation": delta,
                "translation_mm": round(total["translation_mm"] / active_stages, 3),
                "rotation_deg": rotation,
                "intrusion_mm": round(max(0.0, -vertical), 3),
                "extrusion_mm": round(max(0.0, vertical), 3),
                "direction": _direction(delta),
                "attachment": movement["attachment"] if number == 1 else None,
                "ipr": movement["ipr"] if movement["ipr"] and movement["ipr"]["stage"] == number else None,
            })
        stages.append({
            "number": number,
            "kind": "active" if active else "passive",
            "wear_days": 10 if active else 14,
            "movements": stage_movements,
            "notes": (
                "Active programmed movement"
                if active
                else "Passive settling and tracking verification"
            ),
        })
    return stages


def _direction(delta: list[float]) -> str:
    labels = []
    if abs(delta[0]) >= 0.002:
        labels.append("mesial" if delta[0] < 0 else "distal")
    if abs(delta[2]) >= 0.002:
        labels.append("lingual" if delta[2] > 0 else "buccal")
    if abs(delta[1]) >= 0.002:
        labels.append("extrude" if delta[1] > 0 else "intrude")
    return " + ".join(labels) or "rotation"
