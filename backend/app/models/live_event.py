"""Live event models — unified view of internal LMSR and external markets."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDTimestampMixin, utcnow


class LiveEventSource(str, enum.Enum):
    INTERNAL = "internal"
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"
    EXTERNAL = "external"


class LiveEventStatus(str, enum.Enum):
    OPEN = "open"
    CLOSING_SOON = "closing_soon"
    RESOLVED = "resolved"


class LiveEvent(Base, UUIDTimestampMixin):
    """A tradeable prediction market surfaced as a live event.

    ``external_id`` is the upstream identifier (e.g. ``mkt-1`` for LMSR
    seeds or ``poly-<condition_id>`` for Polymarket).
    """

    __tablename__ = "live_events"

    external_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    source: Mapped[LiveEventSource] = mapped_column(
        Enum(LiveEventSource, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
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

    updates = relationship(
        "EventUpdate",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="EventUpdate.recorded_at.desc()",
    )


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
