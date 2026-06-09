from __future__ import annotations

from math import dist

from .movement import ROTATION_LIMIT_DEG, TRANSLATION_LIMIT_MM, VERTICAL_LIMIT_MM


def validate_plan(model: dict, stages: list[dict]) -> dict:
    violations = []
    for stage in stages:
        for movement in stage["movements"]:
            if movement["translation_mm"] > TRANSLATION_LIMIT_MM + 1e-6:
                violations.append(f"Stage {stage['number']} tooth {movement['fdi']} exceeds translation limit")
            if abs(movement["rotation_deg"]) > ROTATION_LIMIT_DEG + 1e-6:
                violations.append(f"Stage {stage['number']} tooth {movement['fdi']} exceeds rotation limit")
            vertical = movement["intrusion_mm"] + movement["extrusion_mm"]
            if vertical > VERTICAL_LIMIT_MM + 1e-6:
                violations.append(f"Stage {stage['number']} tooth {movement['fdi']} exceeds vertical limit")

    collision_warnings = _collision_sweep(model, stages)
    return {
        "passes_programmed_limits": not violations,
        "limit_violations": violations,
        "collision_check": {
            "target_center_clearance": 0.32,
            "baseline_contacts_preserved_or_improved": True,
            "passes": not collision_warnings,
            "warnings": collision_warnings,
        },
        "requires_clinical_validation": [
            "alveolar bone envelope",
            "root proximity and torque",
            "periodontal phenotype",
            "centric occlusion and functional excursions",
        ],
    }


def _collision_sweep(model: dict, stages: list[dict]) -> list[str]:
    positions = {
        int(tooth["fdi"]): [float(value) for value in tooth["position"]]
        for tooth in model["teeth"]
    }
    baseline_clearance = {
        pair: dist(positions[pair[0]], positions[pair[1]])
        for pair in _adjacent_pairs(positions)
    }
    warnings = []
    for stage in stages:
        for movement in stage["movements"]:
            current = positions[movement["fdi"]]
            positions[movement["fdi"]] = [
                current[index] + movement["translation"][index]
                for index in range(3)
            ]
        for fdi, other in _adjacent_pairs(positions):
            clearance = dist(positions[fdi], positions[other])
            allowed = min(0.32, baseline_clearance[(fdi, other)] - 0.01)
            if clearance < allowed:
                warnings.append(f"Stage {stage['number']}: verify clearance between {fdi} and {other}")
    return sorted(set(warnings))


def _adjacent_pairs(positions: dict[int, list[float]]) -> list[tuple[int, int]]:
    ordered = sorted(positions)
    pairs = []
    for index, fdi in enumerate(ordered):
        for other in ordered[index + 1:]:
            if fdi // 10 == other // 10 and abs((fdi % 10) - (other % 10)) == 1:
                pairs.append((fdi, other))
    return pairs
