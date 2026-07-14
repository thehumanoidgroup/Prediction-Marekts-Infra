"""Pydantic schemas for live events."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EventUpdateResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    event_id: str
    probabilities_before: dict[str, Any]
    probabilities_after: dict[str, Any]
    volume_delta: float
    recorded_at: datetime


class LiveEventResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    external_id: str
    source: str
    category: str
    status: str
    question: str
    probabilities: dict[str, Any]
    volume: float
    volume_24h: float
    change_24h: float
    last_updated: datetime


class LiveEventListResponse(BaseModel):
    events: list[LiveEventResponse]
    count: int
    counts: dict[str, int] = Field(
        default_factory=lambda: {"internal": 0, "polymarket": 0},
        description="Event counts by source in the current result set",
    )
    source: str = Field(default="all", description="Applied source filter")


class UpdateProbabilityBody(BaseModel):
    probabilities: dict[str, float] = Field(
        description="Outcome probabilities, e.g. {\"yes\": 0.55, \"no\": 0.45}",
        min_length=1,
    )
    volume_delta: float = Field(default=0.0, ge=0.0)
