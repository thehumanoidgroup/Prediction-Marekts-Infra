"""Unit tests for the S&P 500 dynamic market generator."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.live_event import LiveEventSource
from app.runtime.store import TradingStore
from services.sp500_market_generator import (
    Sp500MarketGenerator,
    build_market_id,
    build_market_specs_for_ticker,
    build_question,
    extract_prices,
    next_friday,
    round_strike,
)


def test_next_friday_from_thursday() -> None:
    assert next_friday(date(2026, 7, 16)) == date(2026, 7, 17)


def test_next_friday_when_already_friday() -> None:
    assert next_friday(date(2026, 7, 17)) == date(2026, 7, 17)


def test_round_strike_around_spot() -> None:
    assert round_strike(100.0, 0.01) == 101.0
    assert round_strike(100.0, -0.02) == 98.0


def test_build_question_variants() -> None:
    assert "today?" in build_question("aapl", 190.0, "0dte")
    assert "Friday?" in build_question("AAPL", 190.0, "weekly")


def test_build_market_specs_count_in_band() -> None:
    specs = build_market_specs_for_ticker(
        "AAPL",
        spot=190.0,
        previous_close=188.5,
        as_of=date(2026, 7, 16),
    )
    assert 6 <= len(specs) <= 10
    assert all(spec.ticker == "AAPL" for spec in specs)
    assert {spec.expiration_type for spec in specs} == {"0dte", "weekly"}
    ids = [spec.market_id for spec in specs]
    assert len(ids) == len(set(ids))
    assert all(spec.market_id.startswith("sp500-AAPL-") for spec in specs)


def test_extract_prices_from_alpaca_snapshot() -> None:
    current, previous = extract_prices(
        {
            "latestTrade": {"p": 191.25},
            "prevDailyBar": {"c": 188.0},
            "dailyBar": {"c": 190.5},
        }
    )
    assert current == 191.25
    assert previous == 188.0


def test_market_id_is_stable() -> None:
    assert (
        build_market_id("msft", "0dte", date(2026, 7, 16), 420.5)
        == "sp500-MSFT-0dte-2026-07-16-420p5"
    )


@pytest.mark.asyncio
async def test_generator_is_idempotent_for_lmsr() -> None:
    client = MagicMock()
    client.get_sp500_tickers.return_value = ["AAPL"]
    client.get_snapshots_all = AsyncMock(
        return_value={
            "AAPL": {
                "latestTrade": {"p": 190.0},
                "prevDailyBar": {"c": 188.0},
            }
        }
    )
    store = TradingStore()
    # Drop seeded catalog markets for a clean count.
    store._markets.clear()

    generator = Sp500MarketGenerator(client=client, store=store)
    first = await generator.generate(persist_events=False, as_of=date(2026, 7, 16))
    second = await generator.generate(persist_events=False, as_of=date(2026, 7, 16))

    assert first.lmsr_created >= 6
    assert second.lmsr_created == 0
    assert second.lmsr_skipped == first.lmsr_created
    assert all(
        market.source == LiveEventSource.SP500_DYNAMIC.value
        for market in store.list_markets()
    )
    assert all(market.stock_ticker == "AAPL" for market in store.list_markets())
