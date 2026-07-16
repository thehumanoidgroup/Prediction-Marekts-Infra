"""US equity calendar helpers for holidays / weekends / weekly rolls."""

from __future__ import annotations

from datetime import date

from integrations.alpaca.market_calendar import (
    is_trading_day,
    next_trading_day,
    next_weekly_expiration,
    session_phase,
)
from services.sp500_market_generator import build_market_specs_for_ticker


def test_weekend_is_not_trading_day() -> None:
    assert is_trading_day(date(2026, 7, 18)) is False  # Saturday
    assert is_trading_day(date(2026, 7, 19)) is False  # Sunday
    assert is_trading_day(date(2026, 7, 17)) is True  # Friday


def test_nyse_holiday_skipped() -> None:
    assert is_trading_day(date(2026, 7, 3)) is False  # Independence Day observed
    assert next_trading_day(date(2026, 7, 3)) == date(2026, 7, 6)


def test_weekly_expiration_rolls_past_holiday_friday() -> None:
    # 2026-07-03 is a Friday holiday — weekly should land on Monday 07-06.
    assert next_weekly_expiration(date(2026, 6, 30)) == date(2026, 7, 6)


def test_generator_skips_penny_and_seeds_next_session_on_weekend() -> None:
    assert build_market_specs_for_ticker("ZZZZ", 0.4, None, as_of=date(2026, 7, 17)) == []

    specs = build_market_specs_for_ticker("AAPL", 200.0, 198.0, as_of=date(2026, 7, 18))
    assert specs
    zero_dte = [s for s in specs if s.expiration_type == "0dte"]
    assert zero_dte
    # Saturday run → next trading day Monday 2026-07-20
    assert zero_dte[0].expiration_date == date(2026, 7, 20)


def test_session_phase_returns_known_label() -> None:
    assert session_phase() in {"pre_market", "regular", "after_hours", "closed"}
