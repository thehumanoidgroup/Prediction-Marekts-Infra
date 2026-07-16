"""Performance: generate LMSR specs / markets for 500+ tickers under a budget."""

from __future__ import annotations

import time
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.runtime.catalog import now_ms
from app.runtime.store import TradingStore
from services.sp500_market_generator import (
    Sp500MarketGenerator,
    build_market_specs_for_ticker,
)


def _synthetic_universe(n: int = 520) -> list[str]:
    # Mix real-looking symbols with padded synthetics so we exceed 500.
    return [f"T{i:03d}" for i in range(n)]


def test_build_specs_for_500_plus_tickers_is_fast() -> None:
    tickers = _synthetic_universe(520)
    started = time.perf_counter()
    total = 0
    for ticker in tickers:
        specs = build_market_specs_for_ticker(
            ticker,
            spot=50.0 + (hash(ticker) % 400),
            previous_close=48.0,
            as_of=date(2026, 7, 16),  # Thursday trading day
        )
        total += len(specs)
    elapsed = time.perf_counter() - started

    assert len(tickers) >= 500
    assert total >= 500 * 6  # 0DTE + weekly offsets
    # Pure CPU path should stay well under a second on CI.
    assert elapsed < 2.5, f"spec build too slow: {elapsed:.2f}s for {total} markets"


@pytest.mark.asyncio
async def test_generator_lmsr_upsert_500_plus_tickers() -> None:
    tickers = _synthetic_universe(520)
    store = TradingStore()
    # Drop seeded catalog markets for a clean SPX count.
    store._markets.clear()

    snapshots = {
        t: {
            "symbol": t,
            "latestTrade": {"p": 100.0 + (i % 50)},
            "prevDailyBar": {"c": 99.0},
        }
        for i, t in enumerate(tickers)
    }

    client = MagicMock()
    client.get_sp500_tickers.return_value = tickers
    client.get_snapshots_all = AsyncMock(return_value=snapshots)
    client.get_current_price = AsyncMock(return_value=100.0)
    client.aclose = AsyncMock()

    settings = MagicMock()
    settings.sp500_generator_ticker_limit = None

    generator = Sp500MarketGenerator(settings=settings, store=store, client=client)
    started = time.perf_counter()
    result = await generator.generate(tickers=tickers, as_of=date(2026, 7, 16), persist_events=False)
    elapsed = time.perf_counter() - started

    assert result.tickers_priced >= 500
    assert result.specs >= 500 * 6
    assert result.lmsr_created >= 500 * 6
    assert len(store.list_markets()) >= 500 * 6
    # In-memory LMSR create should finish quickly without LiveEvent I/O.
    assert elapsed < 8.0, f"LMSR upsert too slow: {elapsed:.2f}s"
    # Sanity: markets close in the future relative to generator clock helpers.
    assert any(m.closes_at > now_ms() - 86_400_000 for m in store.list_markets()[:5])
