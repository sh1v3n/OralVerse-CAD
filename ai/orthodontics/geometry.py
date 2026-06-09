from __future__ import annotations

from math import dist

from .catalog import ALL_FDI, ideal_pose, is_upper


def analyze_geometry(model: dict) -> dict:
    poses = {int(tooth["fdi"]): tooth for tooth in model["teeth"]}
    deviations: dict[int, dict] = {}
    rotation_findings = []
    displaced = []

    for fdi in ALL_FDI:
        current = poses.get(fdi)
        if not current:
            continue
        ideal = ideal_pose(fdi)
        translation = dist(current["position"], ideal["position"])
        rotation = current.get("rotation_deg", 0.0) - ideal["rotation_deg"]
        deviations[fdi] = {
            "translation_mm": round(translation, 3),
            "rotation_deg": round(rotation, 2),
        }
        if abs(rotation) >= 4:
            rotation_findings.append(
                {"fdi": fdi, "degrees": round(rotation, 1), "severity": _severity(abs(rotation), 7, 13)}
            )
        if translation >= 0.12:
            displaced.append(fdi)

    crowding_by_arch = {}
    spacing_by_arch = {}
    for name, fdis in {
        "upper": [f for f in ALL_FDI if is_upper(f)],
        "lower": [f for f in ALL_FDI if not is_upper(f)],
    }.items():
        signed_x = []
        for fdi in fdis:
            if fdi not in poses:
                continue
            ideal = ideal_pose(fdi)
            current = poses[fdi]
            signed_x.append(abs(current["position"][0]) - abs(ideal["position"][0]))
        compression = -sum(v for v in signed_x if v < 0)
        expansion = sum(v for v in signed_x if v > 0)
        crowding_by_arch[name] = round(compression * 1.8, 1)
        spacing_by_arch[name] = round(max(0.0, expansion * 1.3 - compression * 0.25), 1)

    asymmetry = _arch_asymmetry(poses)
    bite = model.get("bite", {})
    overjet = float(bite.get("overjet_mm", 2.5))
    overbite = float(bite.get("overbite_percent", 30))

    issues = []
    for arch, mm in crowding_by_arch.items():
        if mm >= 0.5:
            issues.append({
                "type": "crowding",
                "arch": arch,
                "value": mm,
                "unit": "mm",
                "severity": _severity(mm, 2.0, 4.0),
                "teeth": [f for f in displaced if is_upper(f) == (arch == "upper")],
            })
    for arch, mm in spacing_by_arch.items():
        if mm >= 0.7:
            issues.append({
                "type": "spacing",
                "arch": arch,
                "value": mm,
                "unit": "mm",
                "severity": _severity(mm, 1.5, 3.0),
                "teeth": [],
            })
    if rotation_findings:
        issues.append({
            "type": "rotation",
            "arch": "both",
            "value": max(abs(r["degrees"]) for r in rotation_findings),
            "unit": "deg",
            "severity": max(rotation_findings, key=lambda r: abs(r["degrees"]))["severity"],
            "teeth": [r["fdi"] for r in rotation_findings],
        })
    if asymmetry >= 0.35:
        issues.append({
            "type": "arch_asymmetry",
            "arch": "both",
            "value": asymmetry,
            "unit": "mm",
            "severity": _severity(asymmetry, 0.8, 1.5),
            "teeth": [],
        })
    if overjet < 1.0 or overjet > 3.5:
        issues.append({
            "type": "overjet",
            "arch": "occlusion",
            "value": overjet,
            "unit": "mm",
            "severity": _severity(abs(overjet - 2.5), 2, 4),
            "teeth": [11, 12, 21, 22, 31, 32, 41, 42],
        })
    if overbite < 15 or overbite > 40:
        issues.append({
            "type": "overbite",
            "arch": "occlusion",
            "value": overbite,
            "unit": "%",
            "severity": _severity(abs(overbite - 30), 20, 35),
            "teeth": [11, 12, 21, 22, 31, 32, 41, 42],
        })

    return {
        "issues": issues,
        "tooth_deviations": deviations,
        "metrics": {
            "upper_crowding_mm": crowding_by_arch["upper"],
            "lower_crowding_mm": crowding_by_arch["lower"],
            "upper_spacing_mm": spacing_by_arch["upper"],
            "lower_spacing_mm": spacing_by_arch["lower"],
            "arch_asymmetry_mm": asymmetry,
            "overjet_mm": overjet,
            "overbite_percent": overbite,
            "midline_deviation_mm": float(bite.get("midline_deviation_mm", 0)),
        },
    }


def _arch_asymmetry(poses: dict[int, dict]) -> float:
    pairs = ((11, 21), (12, 22), (13, 23), (14, 24), (15, 25), (31, 41), (32, 42), (33, 43))
    deltas = []
    for right, left in pairs:
        if right in poses and left in poses:
            deltas.append(abs(abs(poses[right]["position"][0]) - abs(poses[left]["position"][0])))
    return round(sum(deltas) / max(len(deltas), 1) * 3, 2)


def _severity(value: float, moderate: float, severe: float) -> str:
    if value >= severe:
        return "high"
    if value >= moderate:
        return "moderate"
    return "mild"
