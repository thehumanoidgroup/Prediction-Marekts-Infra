"""Polling provider that hydrates quotes from the Polymarket integration."""

from __future__ import annotations

from integrations.polymarket import PolymarketError, get_polymarket_service
from tasks.providers.base import IngestedEventSnapshot, LiveDataProvider


def _clamp(price: float) -> float:
    return min(0.97, max(0.03, round(price, 4)))


class PolymarketPollingProvider(LiveDataProvider):
    """Poll active Polymarket markets and normalize them for ingestion."""

    name = "polymarket"

    def __init__(self, *, limit: int = 50) -> None:
        self._limit = limit

    async def fetch_snapshots(self) -> list[IngestedEventSnapshot]:
        try:
            markets = await get_polymarket_service().get_active_markets()
        except PolymarketError:
            return []

        markets.sort(
            key=lambda market: float(market.get("volume24h") or market.get("volume") or 0.0),
            reverse=True,
        )

        snapshots: list[IngestedEventSnapshot] = []
        for market in markets[: self._limit]:
            yes = _clamp(float(market.get("yesPrice") or 0.5))
            snapshots.append(
                IngestedEventSnapshot(
                    external_id=str(market["id"]),
                    source="polymarket",
                    category=str(market.get("category") or "economics"),
                    question=str(market.get("question") or ""),
                    probabilities={"yes": yes, "no": _clamp(1.0 - yes)},
                    status=str(market.get("status") or "open"),
                    volume=float(market.get("volume") or 0.0),
                    volume_24h=float(market.get("volume24h") or 0.0),
                    change_24h=float(market.get("change24h") or 0.0),
                    provider=self.name,
                    metadata={"condition_id": market.get("externalConditionId")},
                )
            )

        return [snapshot for snapshot in snapshots if snapshot.question]
