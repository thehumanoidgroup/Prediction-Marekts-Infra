"""Background task providers for live external data ingestion."""

from tasks.providers.base import IngestedEventSnapshot, LiveDataProvider
from tasks.providers.polymarket_polling import PolymarketPollingProvider
from tasks.providers.sports_polling import SportsPollingProvider

__all__ = [
    "IngestedEventSnapshot",
    "LiveDataProvider",
    "PolymarketPollingProvider",
    "SportsPollingProvider",
]
