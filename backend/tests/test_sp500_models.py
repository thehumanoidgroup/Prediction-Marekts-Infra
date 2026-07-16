"""Tests for S&P 500 dynamic provider model fields."""

from __future__ import annotations

from datetime import date

from app.models import (
    LiveEventSource,
    MarketProvider,
    StockExpirationType,
)
from app.models.account import ChallengeConfig, PropFirmAccount, TraderDemoAccount
from app.models.live_event import LiveEvent
from services.live_event_service import _market_to_event_fields


def test_market_provider_includes_sp500_dynamic() -> None:
    assert MarketProvider.SP500_DYNAMIC.value == "sp500_dynamic"
    assert {m.value for m in MarketProvider} == {
        "internal",
        "polymarket",
        "kalshi",
        "sp500_dynamic",
    }


def test_live_event_source_includes_sp500_dynamic() -> None:
    assert LiveEventSource.SP500_DYNAMIC.value == "sp500_dynamic"
    event = LiveEvent(
        external_id="sp500-AAPL-0dte-2026-07-16",
        source=LiveEventSource.SP500_DYNAMIC,
        category="stocks",
        question="Will AAPL close above $190 on 2026-07-16?",
        probabilities={"yes": 0.52, "no": 0.48},
        stock_ticker="AAPL",
        strike_price=190.0,
        expiration_type=StockExpirationType.ZERO_DTE,
        expiration_date=date(2026, 7, 16),
    )
    assert event.provider == "sp500_dynamic"
    assert event.stock_ticker == "AAPL"
    assert event.expiration_type is StockExpirationType.ZERO_DTE


def test_market_to_event_fields_maps_sp500_metadata() -> None:
    fields = _market_to_event_fields(
        {
            "id": "sp500-MSFT-weekly-2026-07-18",
            "source": "sp500_dynamic",
            "category": "stocks",
            "status": "open",
            "question": "Will MSFT finish above $420 this week?",
            "yesPrice": 0.61,
            "volume": 1000,
            "volume24h": 200,
            "change24h": 0.02,
            "stockTicker": "msft",
            "strikePrice": 420,
            "expirationType": "weekly",
            "expirationDate": "2026-07-18",
        }
    )
    assert fields["source"] is LiveEventSource.SP500_DYNAMIC
    assert fields["stock_ticker"] == "MSFT"
    assert fields["strike_price"] == 420.0
    assert fields["expiration_type"] is StockExpirationType.WEEKLY
    assert fields["expiration_date"] == date(2026, 7, 18)


def test_trader_demo_effective_stock_market() -> None:
    config = ChallengeConfig(
        tenant_id="t1",
        name="S&P 500 $25K",
        provider=MarketProvider.SP500_DYNAMIC,
        starting_balance=25_000,
        stock_ticker="NVDA",
        strike_price=120.0,
        expiration_type=StockExpirationType.WEEKLY,
        expiration_date=date(2026, 7, 18),
        sp500_tickers=["AAPL", "MSFT", "NVDA"],
    )
    account = TraderDemoAccount(
        tenant_id="t1",
        user_id="u1",
        challenge_config_id="c1",
        provider=MarketProvider.SP500_DYNAMIC,
        starting_balance=25_000,
        virtual_balance=25_000,
    )
    account.challenge_config = config
    resolved = account.effective_stock_market()
    assert resolved is not None
    assert resolved["provider"] == "sp500_dynamic"
    assert resolved["stock_ticker"] == "NVDA"
    assert account.effective_sp500_tickers() == ["AAPL", "MSFT", "NVDA"]


def test_prop_firm_account_stock_fields_optional_for_other_providers() -> None:
    product = PropFirmAccount(
        tenant_id="t1",
        challenge_config_id="c1",
        slug="internal-25k",
        label="Internal $25K",
        provider=MarketProvider.INTERNAL,
    )
    assert product.stock_ticker is None
    assert product.strike_price is None
    assert product.expiration_type is None
    assert product.expiration_date is None
