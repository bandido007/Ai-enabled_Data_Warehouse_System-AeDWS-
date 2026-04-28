"""Ranking-explanation prompt — turn rule-based scores into prose."""

from __future__ import annotations

import json
from typing import Any, Dict

from pydantic import BaseModel, Field


class RankingExplanationSchema(BaseModel):
    explanation: str = Field(..., description="Human-readable paragraph explaining the score.")


SCHEMA = RankingExplanationSchema


PROMPT = """You are explaining a warehouse ranking score to a regulator. The
score is rule-based: every component listed below was computed from objective
records (compliance documents on file, inspection outcomes, approval
latency). Your job is to translate the components into a short, neutral
paragraph in plain English. Return ONLY a JSON object conforming to the
response schema.

Rules:
  - Be factual and neutral. Do not editorialise.
  - Mention the strongest and weakest components by name.
  - Keep it under 120 words.

WAREHOUSE: {warehouse_name}

SCORE COMPONENTS:
{components_json}
"""


def render(warehouse_name: str, score_components: Dict[str, Any]) -> str:
    return PROMPT.format(
        warehouse_name=warehouse_name or "(unnamed)",
        components_json=json.dumps(
            score_components or {}, ensure_ascii=False, indent=2
        ),
    )
