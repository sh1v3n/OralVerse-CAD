from __future__ import annotations

from math import cos, pi, sin

ALL_FDI = (
    11, 12, 13, 14, 15, 16, 17, 18,
    21, 22, 23, 24, 25, 26, 27, 28,
    31, 32, 33, 34, 35, 36, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48,
)

TOOTH_NAMES = {
    1: "central incisor",
    2: "lateral incisor",
    3: "canine",
    4: "first premolar",
    5: "second premolar",
    6: "first molar",
    7: "second molar",
    8: "third molar",
}


def is_upper(fdi: int) -> bool:
    return fdi // 10 in (1, 2)


def tooth_label(fdi: int) -> str:
    quadrant = {
        1: "upper right",
        2: "upper left",
        3: "lower left",
        4: "lower right",
    }[fdi // 10]
    return f"{quadrant} {TOOTH_NAMES[fdi % 10]}"


def ideal_pose(fdi: int) -> dict:
    quadrant, position = divmod(fdi, 10)
    side = -1 if quadrant in (1, 4) else 1
    upper = quadrant in (1, 2)
    t = (position - 0.5) / 8
    angle = (pi / 2) * t
    x = side * 2.8 * sin(angle)
    z = -(2.6 * (1 - cos(angle))) + 0.5
    y = 0.4 if upper else -0.4
    rotation = (x / 2.8) * 24
    return {
        "fdi": fdi,
        "position": [round(x, 4), y, round(z, 4)],
        "rotation_deg": round(rotation, 3),
        "confidence": 1.0,
    }


DEMO_OFFSETS: dict[int, tuple[float, float, float, float]] = {
    11: (-0.17, 0.02, -0.16, 7.8),
    12: (0.26, -0.03, 0.08, -13.5),
    13: (-0.12, 0.00, -0.10, 5.1),
    21: (0.14, 0.01, -0.11, -6.2),
    22: (-0.23, 0.02, 0.12, 11.4),
    23: (0.11, 0.00, -0.06, -4.8),
    31: (0.20, 0.06, -0.13, -10.2),
    32: (-0.28, 0.03, 0.10, 14.8),
    33: (0.13, 0.00, -0.08, -6.0),
    34: (-0.10, -0.08, 0.04, 3.2),
    41: (-0.19, 0.04, -0.12, 9.4),
    42: (0.25, 0.02, 0.11, -12.6),
    43: (-0.12, 0.00, -0.07, 5.4),
    44: (0.08, -0.07, 0.03, -2.8),
}


def demo_model() -> dict:
    teeth = []
    for fdi in ALL_FDI:
        pose = ideal_pose(fdi)
        dx, dy, dz, dr = DEMO_OFFSETS.get(fdi, (0.0, 0.0, 0.0, 0.0))
        pose["position"] = [
            round(pose["position"][0] + dx, 4),
            round(pose["position"][1] + dy, 4),
            round(pose["position"][2] + dz, 4),
        ]
        pose["rotation_deg"] = round(pose["rotation_deg"] + dr, 3)
        pose["confidence"] = 0.96 if fdi in DEMO_OFFSETS else 0.99
        teeth.append(pose)
    return {
        "case_id": "demo-moderate-crowding",
        "source": "demo",
        "teeth": teeth,
        "bite": {"overjet_mm": 4.2, "overbite_percent": 48.0, "midline_deviation_mm": 1.1},
    }
