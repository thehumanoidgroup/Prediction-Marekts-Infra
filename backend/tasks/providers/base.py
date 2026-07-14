"""Provider interface for live external data ingestion."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class IngestedEventSnapshot:
    """Normalized event quote from an upstream feed."""

    external_id: str
    source: str
    category: str
    question: str
    probabilities: dict[str, float]
    status: str = "open"
    volume: float = 0.0
    volume_24h: float = 0.0
    change_24h: float = 0.0
    provider: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


class LiveDataProvider(ABC):
    """Poll or receive webhooks from an external live events feed."""

    name: str = "base"

    @abstractmethod
    async def fetch_snapshots(self) -> list[IngestedEventSnapshot]:
        """Return the latest quotes from the upstream source."""
