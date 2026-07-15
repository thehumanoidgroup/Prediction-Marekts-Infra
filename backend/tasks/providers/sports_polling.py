"""Polling provider for sports, politics, and crypto demo feeds.

Replace this module with a real sportsbook/odds API adapter later —
the ingestion service only depends on :class:`LiveDataProvider`.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from tasks.providers.base import IngestedEventSnapshot, LiveDataProvider


def _clamp(price: float) -> float:
    return min(0.97, max(0.03, round(price, 4)))


@dataclass(frozen=True)
class _SeedEvent:
    external_id: str
    category: str
    question: str
    base_yes: float
    volume: float
    volume_24h: float


# Demo catalog — swap for a real provider without touching ingestion orchestration.
_SPORTS_CATALOG: tuple[_SeedEvent, ...] = (
    _SeedEvent(
        "ext-sports-nfl-chiefs-bills",
        "sports",
        "Will the Chiefs cover -3.5 vs Bills tonight?",
        0.54,
        2_400_000,
        180_000,
    ),
    _SeedEvent(
        "ext-sports-nba-finals",
        "sports",
        "Will the Celtics win the 2026 NBA Finals?",
        0.38,
        1_900_000,
        145_000,
    ),
    _SeedEvent(
        "ext-sports-mlb-world-series",
        "sports",
        "Will the Dodgers win the 2026 World Series?",
        0.29,
        1_100_000,
        92_000,
    ),
    _SeedEvent(
        "ext-politics-senate-2026",
        "politics",
        "Will Democrats retain the U.S. Senate in 2026?",
        0.47,
        3_600_000,
        260_000,
    ),
    _SeedEvent(
        "ext-politics-fed-chair",
        "politics",
        "Will the Fed chair change before January 2027?",
        0.22,
        980_000,
        74_000,
    ),
    _SeedEvent(
        "ext-crypto-btc-100k-week",
        "crypto",
        "Will BTC trade above $100K this week?",
        0.61,
        5_200_000,
        410_000,
    ),
    _SeedEvent(
        "ext-crypto-eth-etf-flows",
        "crypto",
        "Will ETH spot ETF see net inflows 5 days in a row?",
        0.44,
        2_800_000,
        220_000,
    ),
)


class SportsPollingProvider(LiveDataProvider):
    """Simulated sports/politics/crypto odds feed via periodic polling."""

    name = "sports"

    def __init__(self) -> None:
        self._state: dict[str, float] = {
            seed.external_id: seed.base_yes for seed in _SPORTS_CATALOG
        }
        self._change_24h: dict[str, float] = {seed.external_id: 0.0 for seed in _SPORTS_CATALOG}

    async def fetch_snapshots(self) -> list[IngestedEventSnapshot]:
        snapshots: list[IngestedEventSnapshot] = []

        for seed in _SPORTS_CATALOG:
            previous = self._state[seed.external_id]
            drift = random.uniform(-0.02, 0.02)
            yes = _clamp(previous + drift)
            self._state[seed.external_id] = yes
            self._change_24h[seed.external_id] = round(yes - seed.base_yes, 4)

            volume_delta = random.uniform(1_000, 25_000)
            snapshots.append(
                IngestedEventSnapshot(
                    external_id=seed.external_id,
                    source="external",
                    category=seed.category,
                    question=seed.question,
                    probabilities={"yes": yes, "no": _clamp(1.0 - yes)},
                    status="open",
                    volume=seed.volume + volume_delta,
                    volume_24h=seed.volume_24h + volume_delta * 0.4,
                    change_24h=self._change_24h[seed.external_id],
                    provider=self.name,
                    metadata={"feed": "demo-sports-poll"},
                )
            )

        return snapshots
