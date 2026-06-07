"""Extract tooth-numbered findings from OCR'd report text.

Supports two providers, both with generous free tiers:

  - Groq        (env: GROQ_API_KEY)            — preferred when set
  - Gemini      (env: GEMINI_API_KEY or GOOGLE_API_KEY)

The function picks whichever key is configured. Returns a list of
{fdi, label, confidence, note} dicts merged into the findings table with
source="report".
"""
from __future__ import annotations

import json
import os
from typing import TypedDict

import httpx


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

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

REQUEST_TIMEOUT = 30.0


def _call_groq(api_key: str, ocr_text: str) -> str:
    resp = httpx.post(
        GROQ_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": ocr_text[:12000]},
            ],
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
        },
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def _call_gemini(api_key: str, ocr_text: str) -> str:
    resp = httpx.post(
        GEMINI_URL,
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [
                {"role": "user", "parts": [{"text": ocr_text[:12000]}]},
            ],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
            },
        },
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _llm_extract(ocr_text: str) -> str:
    groq_key = os.environ.get("GROQ_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if groq_key:
        return _call_groq(groq_key, ocr_text)
    if gemini_key:
        return _call_gemini(gemini_key, ocr_text)
    raise RuntimeError(
        "No LLM provider configured — set GROQ_API_KEY or GEMINI_API_KEY"
    )


def _coerce_findings(parsed: object) -> list[ReportFinding]:
    # Groq's json_object mode wraps the array in an object; Gemini may return
    # the bare array. Accept either shape.
    if isinstance(parsed, dict):
        for value in parsed.values():
            if isinstance(value, list):
                parsed = value
                break
        else:
            return []
    if not isinstance(parsed, list):
        return []
    out: list[ReportFinding] = []
    for item in parsed:
        if not isinstance(item, dict) or "fdi" not in item or "label" not in item:
            continue
        try:
            out.append(
                ReportFinding(
                    fdi=int(item["fdi"]),
                    label=str(item["label"]).lower(),
                    confidence=float(item.get("confidence", 0.7)),
                    note=str(item.get("note", "")),
                )
            )
        except (TypeError, ValueError):
            continue
    return out


def parse_report(ocr_text: str) -> list[ReportFinding]:
    raw = _llm_extract(ocr_text).strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return _coerce_findings(parsed)
