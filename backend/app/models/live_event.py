"""Live event models — unified view of internal LMSR and external markets."""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.account import StockExpirationType
from app.models.base import Base, UUIDTimestampMixin, utcnow


class LiveEventSource(str, enum.Enum):
    """Liquidity / data provider for a live event (multi-provider feed).

    Values mirror account ``MarketProvider`` where applicable, plus
    ``external`` for generic ingested sports/news snapshots.
    """

    INTERNAL = "internal"
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"
    SP500_DYNAMIC = "sp500_dynamic"
    EXTERNAL = "external"


class LiveEventStatus(str, enum.Enum):
    OPEN = "open"
    CLOSING_SOON = "closing_soon"
    RESOLVED = "resolved"


class LiveEvent(Base, UUIDTimestampMixin):
    """A tradeable prediction market surfaced as a live event.

    ``external_id`` is the upstream identifier (e.g. ``mkt-1`` for LMSR
    seeds, ``poly-<condition_id>`` for Polymarket, or ``sp500-AAPL-0dte-…``
    for dynamic S&P 500 stock markets).

    For ``source=sp500_dynamic``, populate ``stock_ticker``, ``strike_price``,
    ``expiration_type``, and ``expiration_date``. Other providers leave these null.
    """

    __tablename__ = "live_events"

    external_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    source: Mapped[LiveEventSource] = mapped_column(
        Enum(LiveEventSource, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    # Alias of ``source`` for API parity with account ``provider`` field.
    # Kept as a generated convenience property — DB column is ``source``.
    category: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    status: Mapped[LiveEventStatus] = mapped_column(
        Enum(LiveEventStatus, values_callable=lambda e: [m.value for m in e]),
        default=LiveEventStatus.OPEN,
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    probabilities: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    volume: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    volume_24h: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    change_24h: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    # S&P 500 dynamic stock prediction markets (nullable for other providers).
    stock_ticker: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    strike_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    expiration_type: Mapped[StockExpirationType | None] = mapped_column(
        Enum(StockExpirationType, values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    updates = relationship(
        "EventUpdate",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="EventUpdate.recorded_at.desc()",
    )

    @property
    def provider(self) -> str:
        """Provider id — same values as account ``MarketProvider`` / ``source``."""
        return self.source.value


class EventUpdate(Base, UUIDTimestampMixin):
    """Historical probability / price change for a live event."""

    __tablename__ = "event_updates"

    event_id: Mapped[str] = mapped_column(
        ForeignKey("live_events.id", ondelete="CASCADE"), index=True, nullable=False
    )
    probabilities_before: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    probabilities_after: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    volume_delta: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    event = relationship("LiveEvent", back_populates="updates")
