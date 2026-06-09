from __future__ import annotations

import json
import os
from urllib.request import Request, urlopen

from .copilot import answer_question


def answer_with_local_llm(question: str, plan: dict) -> dict:
    """Use an OpenAI-compatible local endpoint when configured.

    The deterministic copilot remains the fallback and supplies tooth
    highlighting even when no local model is running.
    """
    fallback = answer_question(question, plan)
    endpoint = os.environ.get("LOCAL_LLM_URL")
    if not endpoint:
        return fallback

    compact_context = {
        "issues": plan["analysis"]["issues"],
        "movements": plan["movements"],
        "stages": plan["stages"],
        "prediction": plan["prediction"],
    }
    payload = {
        "model": os.environ.get("LOCAL_LLM_MODEL", "orthodontic-copilot"),
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an orthodontic decision-support copilot. Answer only from the "
                    "provided treatment plan. Never present the plan as an autonomous prescription."
                ),
            },
            {
                "role": "user",
                "content": f"PLAN:\n{json.dumps(compact_context)}\n\nQUESTION:\n{question}",
            },
        ],
        "temperature": 0.1,
    }
    try:
        request = Request(
            endpoint.rstrip("/") + "/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=20) as response:  # noqa: S310 - endpoint is operator-configured
            result = json.load(response)
        fallback["answer"] = result["choices"][0]["message"]["content"]
        fallback["source"] = "local LLM grounded in constraint-aware treatment plan"
    except (OSError, KeyError, ValueError):
        pass
    return fallback
