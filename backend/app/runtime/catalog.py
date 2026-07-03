"""Seeded market catalog — ids align with the frontend demo store."""

from __future__ import annotations

import time
from dataclasses import dataclass

HOUR_MS = 3_600_000
DAY_MS = 24 * HOUR_MS


@dataclass(frozen=True)
class MarketSeed:
    id: str
    question: str
    category: str
    base_price: float
    days_to_close: int
    volume_scale: float


MARKET_SEEDS: tuple[MarketSeed, ...] = (
    MarketSeed("mkt-1", "Will BTC close above $150K on Dec 31, 2026?", "crypto", 0.42, 182, 4.2),
    MarketSeed("mkt-2", "Will ETH flip $10K before October 2026?", "crypto", 0.18, 90, 2.1),
    MarketSeed("mkt-3", "Will SOL trade above $500 by end of Q3 2026?", "crypto", 0.31, 91, 1.6),
    MarketSeed("mkt-4", "Will NVDA market cap exceed $6T by year end?", "stocks", 0.56, 182, 3.8),
    MarketSeed("mkt-5", "Will AAPL announce an AI wearable in 2026?", "stocks", 0.37, 150, 1.4),
    MarketSeed("mkt-6", "Will TSLA deliver 2.5M+ vehicles in 2026?", "stocks", 0.44, 210, 2.4),
    MarketSeed("mkt-7", "Will EUR/USD trade above 1.15 by September?", "forex", 0.61, 75, 1.9),
    MarketSeed("mkt-8", "Will USD/JPY break below 140 this quarter?", "forex", 0.28, 60, 1.2),
    MarketSeed("mkt-9", "Will gold close above $3,500/oz in August 2026?", "commodities", 0.52, 45, 2.7),
    MarketSeed("mkt-10", "Will WTI crude average under $70 in Q3 2026?", "commodities", 0.47, 91, 1.1),
    MarketSeed("mkt-11", "Will the Fed cut rates at the September FOMC?", "economics", 0.68, 76, 5.1),
    MarketSeed("mkt-12", "Will US CPI YoY print below 2.5% in July?", "economics", 0.33, 12, 3.3),
    MarketSeed("mkt-13", "Will US unemployment exceed 4.5% by October?", "economics", 0.24, 110, 1.8),
    MarketSeed("mkt-14", "Will the S&P 500 close above 7,000 this year?", "indices", 0.58, 182, 4.6),
    MarketSeed("mkt-15", "Will the Nasdaq-100 hit a new ATH in July 2026?", "indices", 0.71, 29, 2.9),
    MarketSeed("mkt-16", "Will the VIX spike above 35 before September?", "indices", 0.19, 74, 1.5),
)


def now_ms() -> int:
    return int(time.time() * 1000)
