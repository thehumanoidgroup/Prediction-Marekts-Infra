"""Durable audit trail for automated market resolutions."""

from __future__ import annotations

import enum
from datetime import date
from typing import Any

from sqlalchemy import Date, Enum, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDTimestampMixin


class ResolutionAuditStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class MarketResolutionAudit(Base, UUIDTimestampMixin):
    """One attempt to resolve a prediction market (EOD S&P 500, etc.)."""

    __tablename__ = "market_resolution_audits"

    market_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    external_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    stock_ticker: Mapped[str | None] = mapped_column(String(16), index=True, nullable=True)
    strike_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    close_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    expiration_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    winning_outcome: Mapped[str | None] = mapped_column(String(8), nullable=True)
    settlements_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[ResolutionAuditStatus] = mapped_column(
        Enum(ResolutionAuditStatus, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
