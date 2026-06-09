from __future__ import annotations

import re


def answer_question(question: str, plan: dict) -> dict:
    normalized = question.lower().strip()
    stage_match = re.search(r"(?:aligner|stage)\s*(\d+)", normalized)
    if stage_match:
        number = int(stage_match.group(1))
        stage = next((s for s in plan["stages"] if s["number"] == number), None)
        if not stage:
            return _answer(f"This plan has {len(plan['stages'])} aligners; aligner {number} is outside the plan.", [])
        if not stage["movements"]:
            return _answer(
                f"Aligner {number} is a passive settling stage with no programmed tooth movement.",
                [],
            )
        descriptions = [_movement_text(m) for m in stage["movements"]]
        return _answer(
            f"Aligner {number} has {len(stage['movements'])} active teeth. "
            + "; ".join(descriptions[:6])
            + ("." if len(descriptions) <= 6 else f"; plus {len(descriptions) - 6} smaller movements."),
            [m["fdi"] for m in stage["movements"]],
        )

    if "highest movement" in normalized or "most movement" in normalized:
        ranked = sorted(
            plan["movements"],
            key=lambda m: m["total"]["translation_mm"] + abs(m["total"]["rotation_deg"]) / 10,
            reverse=True,
        )[:5]
        text = ", ".join(
            f"{m['fdi']} ({m['total']['translation_mm']:.2f} mm, {abs(m['total']['rotation_deg']):.1f} deg)"
            for m in ranked
        )
        return _answer(f"The highest programmed movements are: {text}.", [m["fdi"] for m in ranked])

    if "attachment" in normalized:
        attachments = [m for m in plan["movements"] if m.get("attachment")]
        text = ", ".join(
            f"{m['fdi']}: {m['attachment']['type']} on the {m['attachment']['surface']}"
            for m in attachments
        )
        return _answer(
            f"Recommended attachments: {text}. Confirm available crown surface and bonding clearance clinically.",
            [m["fdi"] for m in attachments],
        )

    if "duration" in normalized or "how long" in normalized:
        p = plan["prediction"]
        return _answer(
            f"Estimated treatment duration is {p['estimated_duration_weeks']} weeks "
            f"(about {p['estimated_duration_months']} months), including passive settling.",
            [],
        )

    if "refinement" in normalized or "predict" in normalized:
        p = plan["prediction"]
        percent = round(p["refinement_probability"] * 100)
        teeth = [risk["fdi"] for risk in p["risk_teeth"][:3]]
        return _answer(
            f"Estimated refinement probability is {percent}%. The main tracking watchlist is "
            + ", ".join(str(fdi) for fdi in teeth)
            + ". This estimate assumes compliant wear and healthy periodontal support.",
            teeth,
        )

    if "ipr" in normalized:
        ipr = plan["report"]["ipr_plan"]
        text = ", ".join(
            f"{item['between'][0]}/{item['between'][1]}: {item['amount_mm']:.2f} mm at stage {item['stage']}"
            for item in ipr
        )
        return _answer(f"Planned IPR: {text or 'none'}. Verify enamel thickness before reduction.", [])

    return _answer(
        "I can explain any aligner stage, rank tooth movement, review attachments or IPR, "
        "estimate duration, and summarize refinement risk.",
        [],
    )


def _movement_text(movement: dict) -> str:
    parts = []
    if abs(movement["rotation_deg"]) >= 0.05:
        parts.append(f"rotate {movement['rotation_deg']:+.2f} deg")
    if movement["translation_mm"] >= 0.01:
        parts.append(f"{movement['direction']} {movement['translation_mm']:.2f} mm")
    return f"{movement['fdi']} " + ", ".join(parts)


def _answer(text: str, teeth: list[int]) -> dict:
    return {
        "answer": text,
        "highlight_teeth": teeth,
        "source": "constraint-aware treatment plan",
        "clinical_notice": "For clinician decision support; not an autonomous prescription.",
    }
