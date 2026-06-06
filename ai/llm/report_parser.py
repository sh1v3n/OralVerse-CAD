"""Use Claude opus-4-7 to extract tooth-numbered findings from OCR'd report text.

Returns a list of {fdi, label, confidence, note} dicts merged into the findings
table with source="report".

The system prompt is marked for prompt caching — same system instruction across
every report parse, so we get an automatic cache hit after the first call.
"""
from __future__ import annotations

import json
import os
from typing import TypedDict

import anthropic


class ReportFinding(TypedDict, total=False):
    fdi: int
    label: str
    confidence: float
    note: str


SYSTEM_PROMPT = """You are a clinical NLP assistant for a dental records system.

Given OCR'd text from a dental report (sometimes noisy), extract structured
findings keyed by FDI tooth number.

Rules:
- Use the FDI two-digit numbering system (11-18, 21-28, 31-38, 41-48).
- If a finding mentions a tooth by a different notation (Universal 1-32,
  Palmer, or just "upper left first molar"), translate it to FDI.
- Use these label canon forms only: caries, fractured, impacted, infection,
  bdc_bdr, healthy, missing, restoration, root_canal, crown, implant.
- "confidence" is your confidence the finding is correct given the OCR text,
  on a 0-1 scale.
- If no tooth-specific findings can be extracted, return an empty array.
- Return STRICT JSON: a single array of objects with fields fdi (int),
  label (string), confidence (float 0-1), note (string, original phrasing).
  No markdown, no commentary, just the JSON array.
"""


def parse_report(ocr_text: str) -> list[ReportFinding]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    client = anthropic.Anthropic(api_key=api_key)
    resp = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": ocr_text[:12000]}],
    )
    raw = "".join(block.text for block in resp.content if block.type == "text").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    out: list[ReportFinding] = []
    for item in parsed:
        if not isinstance(item, dict) or "fdi" not in item or "label" not in item:
            continue
        out.append(
            ReportFinding(
                fdi=int(item["fdi"]),
                label=str(item["label"]).lower(),
                confidence=float(item.get("confidence", 0.7)),
                note=str(item.get("note", "")),
            )
        )
    return out
