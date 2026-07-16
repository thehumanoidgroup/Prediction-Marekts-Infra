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
