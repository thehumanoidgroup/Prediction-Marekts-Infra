"""US equity session helpers for S&P 500 market generation / resolution.

Handles weekends, common NYSE holidays, and coarse after-hours detection so
0DTE / weekly markets are not opened or resolved on non-sessions.

Alpaca Market Data does not publish a session calendar on the free tier, so this
module ships a static NYSE holiday set sufficient for the MVP.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

_ET = ZoneInfo("America/New_York")

# Observed NYSE full-day closures (extend annually for production calendars).
# Early-close days are treated as regular sessions for MVP strike generation;
# resolution still waits for the official daily bar.
_NYSE_HOLIDAYS: frozenset[date] = frozenset(
    {
        # 2025
        date(2025, 1, 1),
        date(2025, 1, 20),
        date(2025, 2, 17),
        date(2025, 4, 18),
        date(2025, 5, 26),
        date(2025, 6, 19),
        date(2025, 7, 4),
        date(2025, 9, 1),
        date(2025, 11, 27),
        date(2025, 12, 25),
        # 2026
        date(2026, 1, 1),
        date(2026, 1, 19),
        date(2026, 2, 16),
        date(2026, 4, 3),
        date(2026, 5, 25),
        date(2026, 6, 19),
        date(2026, 7, 3),  # Independence Day observed
        date(2026, 9, 7),
        date(2026, 11, 26),
        date(2026, 12, 25),
        # 2027
        date(2027, 1, 1),
        date(2027, 1, 18),
        date(2027, 2, 15),
        date(2027, 3, 26),
        date(2027, 5, 31),
        date(2027, 6, 18),  # Juneteenth observed
        date(2027, 7, 5),  # Independence Day observed
        date(2027, 9, 6),
        date(2027, 11, 25),
        date(2027, 12, 24),  # Christmas observed
    }
)

_REGULAR_OPEN = time(9, 30)
_REGULAR_CLOSE = time(16, 0)


def us_equity_now(now: datetime | None = None) -> datetime:
    current = now or datetime.now(tz=_ET)
    if current.tzinfo is None:
        return current.replace(tzinfo=_ET).astimezone(_ET)
    return current.astimezone(_ET)


def us_equity_today(now: datetime | None = None) -> date:
    return us_equity_now(now).date()


def is_weekend(day: date) -> bool:
    return day.weekday() >= 5


def is_nyse_holiday(day: date) -> bool:
    return day in _NYSE_HOLIDAYS


def is_trading_day(day: date) -> bool:
    """True when the US equity cash session is scheduled to open."""
    return not is_weekend(day) and not is_nyse_holiday(day)


def next_trading_day(on_or_after: date) -> date:
    day = on_or_after
    for _ in range(14):
        if is_trading_day(day):
            return day
        day += timedelta(days=1)
    return on_or_after


def previous_trading_day(on_or_before: date) -> date:
    day = on_or_before
    for _ in range(14):
        if is_trading_day(day):
            return day
        day -= timedelta(days=1)
    return on_or_before


def next_weekly_expiration(on_or_after: date) -> date:
    """Friday-or-next-trading-day weekly close (skips holiday Fridays)."""
    # weekday(): Mon=0 … Fri=4
    delta = (4 - on_or_after.weekday()) % 7
    friday = on_or_after + timedelta(days=delta)
    return next_trading_day(friday)


def session_phase(now: datetime | None = None) -> str:
    """Return ``pre_market`` | ``regular`` | ``after_hours`` | ``closed``."""
    current = us_equity_now(now)
    day = current.date()
    if not is_trading_day(day):
        return "closed"
    clock = current.timetz().replace(tzinfo=None)
    if clock < _REGULAR_OPEN:
        return "pre_market"
    if clock < _REGULAR_CLOSE:
        return "regular"
    return "after_hours"


def is_regular_session(now: datetime | None = None) -> bool:
    return session_phase(now) == "regular"


def quote_is_stale_or_thin(
    *,
    has_latest_trade: bool,
    has_daily_bar: bool,
    previous_close_only: bool,
    now: datetime | None = None,
) -> bool:
    """Heuristic for after-hours / low-volume / halt-like thin books."""
    phase = session_phase(now)
    if previous_close_only:
        return True
    if phase in {"pre_market", "after_hours", "closed"} and not has_latest_trade:
        return True
    if phase == "regular" and not has_latest_trade and not has_daily_bar:
        return True
    return False
