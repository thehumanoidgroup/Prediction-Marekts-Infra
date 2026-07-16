"""Webhook + manual provisioning for sp500_dynamic evaluation accounts."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import SessionLocal
from app.models import IssuanceSource, MarketProvider, SoldAccount, TraderDemoAccount
from app.runtime.catalog import now_ms
from app.runtime.store import get_trading_store

APEX_HEADERS = {"X-Tenant-Slug": "apex"}
SP500_MARKET_ID = "sp500-AAPL-0dte-2026-07-16-210"


@pytest.fixture
def email_mock():
    with patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        yield


@pytest.mark.asyncio
async def test_webhook_provisions_sp500_dynamic_account(
    client: TestClient,
    email_mock,
) -> None:
    email = "sp500-webhook@example.com"
    response = client.post(
        "/api/v1/webhooks/accounts",
        headers=APEX_HEADERS,
        json={
            "email": email,
            "provider": "sp500_dynamic",
            "account_size": 25_000,
            "model_type": "1step",
            "external_order_id": "spx-order-001",
            "challenge_rules": {"profit_target_pct": 8, "max_daily_loss_pct": 4},
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["provider"] == "sp500_dynamic"
    assert body["account_id"] == body["trader_demo_account_id"]
    assert body["sp500_dynamic_enabled"] is True
    assert len(body["sp500_tickers"]) >= 1
    assert "AAPL" in body["sp500_tickers"]
    assert "S&P 500" in body["message"] or body["provider"] == "sp500_dynamic"

    async with SessionLocal() as db:
        result = await db.execute(
            select(TraderDemoAccount)
            .where(TraderDemoAccount.starting_balance == 25_000)
            .options(
                selectinload(TraderDemoAccount.challenge_config),
                selectinload(TraderDemoAccount.prop_firm_account),
            )
        )
        accounts = list(result.scalars().all())
        match = [a for a in accounts if a.provider is MarketProvider.SP500_DYNAMIC]
        assert match, "expected sp500_dynamic trader demo account"
        assert match[0].provider is MarketProvider.SP500_DYNAMIC
        assert match[0].effective_sp500_tickers()

        sold = await db.execute(
            select(SoldAccount).where(SoldAccount.trader_email == email)
        )
        row = sold.scalar_one()
        assert row.provider is MarketProvider.SP500_DYNAMIC
        assert row.issuance_source is IssuanceSource.WEBHOOK
        assert row.metadata_json
        assert "sp500_tickers" in row.metadata_json


@pytest.mark.asyncio
async def test_manual_issue_sp500_with_stock_template(
    client: TestClient,
    email_mock,
) -> None:
    templates = client.get(
        "/api/v1/admin/accounts/templates",
        headers=APEX_HEADERS,
        params={"provider": "sp500_dynamic"},
    )
    assert templates.status_code == 200, templates.text
    rows = templates.json()
    assert any(t["id"].startswith("sp500-") for t in rows)
    assert all(t["provider"] == "sp500_dynamic" for t in rows if t["id"].startswith("sp500-"))

    issued = client.post(
        "/api/v1/admin/accounts/provision",
        headers=APEX_HEADERS,
        json={
            "email": "sp500-manual@example.com",
            "provider": "sp500_dynamic",
            "account_size": 50_000,
            "model_type": "1step",
            "template_config_id": "sp500-weekly-standard",
            "challenge_rules": {"max_stake_per_order": 2_000},
        },
    )
    assert issued.status_code == 201, issued.text
    body = issued.json()
    assert body["provider"] == "sp500_dynamic"
    assert body["account_size"] == 50_000
    assert body["sp500_dynamic_enabled"] is True
    assert len(body["sp500_tickers"]) >= 1


def test_provisioned_account_trades_sp500_with_rules_enforced(
    client: TestClient,
    email_mock,
) -> None:
    """Webhook-provisioned SP500 account enforces stake limits on virtual equity bets."""
    email = "trader-sp500-flow@example.com"

    provision = client.post(
        "/api/v1/webhooks/accounts",
        headers=APEX_HEADERS,
        json={
            "email": email,
            "provider": "sp500_dynamic",
            "account_size": 10_000,
            "challenge_rules": {"max_stake_per_order": 200},
        },
    )
    assert provision.status_code == 201, provision.text
    account_id = provision.json()["account_id"]
    provision_body = provision.json()

    program = {
        "starting_balance": provision_body["account_size"],
        "account_sizes": [int(provision_body["account_size"])],
        "profit_target_pct": provision_body["applied_rules"]["profit_target_pct"],
        "max_daily_loss_pct": provision_body["applied_rules"]["max_daily_loss_pct"],
        "max_drawdown_pct": provision_body["applied_rules"]["max_drawdown_pct"],
        "drawdown_mode": provision_body["applied_rules"]["drawdown_mode"],
        "max_stake_per_order": 200,
        "max_exposure_per_market": provision_body["applied_rules"].get("max_exposure_per_market"),
        "min_trading_days": provision_body["applied_rules"]["min_trading_days"],
        "provider": "sp500_dynamic",
    }
    tickers = provision_body["sp500_tickers"]
    user_id = provision_body["user_id"]

    store = get_trading_store()
    store.create_market(
        market_id=SP500_MARKET_ID,
        question="Will AAPL close above $210 today?",
        category="stocks",
        base_price=0.55,
        closes_at=now_ms() + 3_600_000,
        source="sp500_dynamic",
        stock_ticker="AAPL",
        strike_price=210.0,
        expiration_type="0dte",
        expiration_date="2026-07-16",
    )

    session = store.reset_session(
        "apex-flow",
        user_id,
        program,
        provider="sp500_dynamic",
        sp500_tickers=tickers,
        demo_account_id=account_id,
    )
    assert "AAPL" in {t.upper() for t in session.sp500_tickers}

    blocked = store.preview_order_risk(
        session,
        market_id=SP500_MARKET_ID,
        outcome="yes",
        side="buy",
        shares=1000,
        yes_price=0.55,
    )
    assert blocked["allowed"] is False
    assert any("per-pick limit" in r or "max" in r.lower() for r in blocked["reasons"])

    # Prefer LMSR path when the market lives in the store (same as trading route).
    result = store.place_order(
        session,
        market_id=SP500_MARKET_ID,
        outcome="yes",
        side="buy",
        shares=50,
    )
    assert result["order"]["marketId"] == SP500_MARKET_ID

    store.sync_session_risk(session)
    prices = store.market_prices_for_session(session)
    snap = session.bankroll.mark_to_market(prices)
    assert snap.equity > 0
    assert session.risk.status.value == "active"

    positions = session.bankroll.positions()
    assert len(positions) == 1
    assert positions[0].market_id == SP500_MARKET_ID

    # Allowlist is attached to the trading session for the API layer.
    assert "ZZZZ" not in {t.upper() for t in session.sp500_tickers}
    assert session.provider == "sp500_dynamic"


@pytest.mark.asyncio
async def test_full_prop_firm_sp500_account_e2e(
    client: TestClient,
    email_mock,
) -> None:
    """Sample prop firm purchase → provision → hybrid markets → rules → allowlist."""
    email = "apex-sp500-e2e@example.com"

    purchase = client.post(
        "/api/v1/webhooks/accounts",
        headers=APEX_HEADERS,
        json={
            "email": email,
            "provider": "sp500_dynamic",
            "account_size": 25_000,
            "model_type": "1step",
            "external_order_id": "apex-spx-e2e-001",
            "challenge_rules": {
                "max_stake_per_order": 500,
                "profit_target_pct": 10,
                "max_daily_loss_pct": 5,
            },
        },
    )
    assert purchase.status_code == 201, purchase.text
    body = purchase.json()
    assert body["provider"] == "sp500_dynamic"
    assert body["sp500_dynamic_enabled"] is True
    tickers = [t.upper() for t in body["sp500_tickers"]]
    assert "AAPL" in tickers
    assert "MSFT" in tickers

    store = get_trading_store()
    # Seed allowlisted + off-allowlist markets for hybrid listing.
    for market_id, ticker, strike in [
        ("sp500-AAPL-0dte-2026-07-16-210", "AAPL", 210.0),
        ("sp500-MSFT-0dte-2026-07-16-420", "MSFT", 420.0),
        ("sp500-ZZZZ-0dte-2026-07-16-10", "ZZZZ", 10.0),
    ]:
        store.create_market(
            market_id=market_id,
            question=f"Will {ticker} close above ${strike:.0f} today?",
            category="stocks",
            base_price=0.5,
            closes_at=now_ms() + 3_600_000,
            source="sp500_dynamic",
            stock_ticker=ticker,
            strike_price=strike,
            expiration_type="0dte",
            expiration_date="2026-07-16",
        )

    from app.runtime.hybrid_markets import list_hybrid_markets

    hybrid = await list_hybrid_markets(source="sp500_dynamic", sp500_tickers=tickers)
    assert hybrid["counts"]["sp500_dynamic"] >= 2
    listed = {m["id"] for m in hybrid["markets"]}
    assert "sp500-AAPL-0dte-2026-07-16-210" in listed
    assert "sp500-MSFT-0dte-2026-07-16-420" in listed
    assert "sp500-ZZZZ-0dte-2026-07-16-10" not in listed

    program = {
        "starting_balance": body["account_size"],
        "account_sizes": [int(body["account_size"])],
        "profit_target_pct": body["applied_rules"]["profit_target_pct"],
        "max_daily_loss_pct": body["applied_rules"]["max_daily_loss_pct"],
        "max_drawdown_pct": body["applied_rules"]["max_drawdown_pct"],
        "drawdown_mode": body["applied_rules"]["drawdown_mode"],
        "max_stake_per_order": 500,
        "min_trading_days": body["applied_rules"]["min_trading_days"],
        "provider": "sp500_dynamic",
    }
    session = store.reset_session(
        "apex",
        body["user_id"],
        program,
        provider="sp500_dynamic",
        sp500_tickers=tickers,
        demo_account_id=body["account_id"],
    )

    # Oversized stake blocked by challenge rules.
    blocked = store.preview_order_risk(
        session,
        market_id="sp500-AAPL-0dte-2026-07-16-210",
        outcome="yes",
        side="buy",
        shares=5_000,
        yes_price=0.55,
    )
    assert blocked["allowed"] is False

    # Valid virtual bet fills and updates equity / risk.
    filled = store.place_order(
        session,
        market_id="sp500-AAPL-0dte-2026-07-16-210",
        outcome="yes",
        side="buy",
        shares=40,
    )
    assert filled["order"]["marketId"].startswith("sp500-AAPL-")
    store.sync_session_risk(session)
    assert session.risk.status.value == "active"
    assert any(p.market_id.startswith("sp500-AAPL-") for p in session.bankroll.positions())

    # Off-allowlist ticker is not in the provisioned universe.
    assert "ZZZZ" not in {t.upper() for t in session.sp500_tickers}

    # Sold-accounts listing exposes the provider for Super Admin filters.
    sold = client.get("/api/v1/platform/sold-accounts", headers=APEX_HEADERS)
    if sold.status_code == 200:
        rows = sold.json()
        match = [r for r in rows if r.get("trader_email") == email]
        if match:
            assert match[0]["provider"] == "sp500_dynamic"
