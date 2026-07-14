"""End-to-end Kalshi provisioning: webhook purchase and manual issuance."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import IssuanceSource, MarketProvider, SoldAccount, TraderDemoAccount, User
from app.runtime.store import get_trading_store

APEX_HEADERS = {"X-Tenant-Slug": "apex"}
KALSHI_TICKERS = ["KXBTC-25DEC31", "KXFED-25DEC31"]
KALSHI_MARKET_ID = "kalshi-KXBTC-25DEC31"


@pytest.fixture
def kalshi_mocks():
    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=KALSHI_TICKERS,
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        yield


@pytest.mark.asyncio
async def test_webhook_then_manual_both_issue_kalshi_accounts(
    client: TestClient,
    kalshi_mocks,
) -> None:
    """Purchase webhook and manual admin issuance both create Kalshi demo accounts."""
    webhook_email = "webhook-flow@example.com"
    manual_email = "manual-flow@example.com"

    webhook = client.post(
        "/api/v1/webhooks/accounts",
        headers=APEX_HEADERS,
        json={
            "email": webhook_email,
            "provider": "kalshi",
            "account_size": 10_000,
            "model_type": "1step",
            "external_order_id": "purchase-order-001",
            "challenge_rules": {"profit_target_pct": 10},
        },
    )
    assert webhook.status_code == 201, webhook.text
    webhook_body = webhook.json()
    assert webhook_body["provider"] == "kalshi"
    assert webhook_body["account_id"] == webhook_body["trader_demo_account_id"]
    assert webhook_body["kalshi_live_integration_enabled"] is True
    assert webhook_body["kalshi_market_tickers"] == KALSHI_TICKERS

    manual = client.post(
        "/api/v1/admin/accounts/provision",
        headers=APEX_HEADERS,
        json={
            "email": manual_email,
            "provider": "kalshi",
            "account_size": 25_000,
            "model_type": "2step",
            "challenge_rules": {"max_stake_per_order": 500},
        },
    )
    assert manual.status_code == 201, manual.text
    manual_body = manual.json()
    assert manual_body["provider"] == "kalshi"
    assert manual_body["model_type"] == "2step"
    assert manual_body["kalshi_live_integration_enabled"] is True

    async with SessionLocal() as db:
        for email, source in (
            (webhook_email, IssuanceSource.WEBHOOK),
            (manual_email, IssuanceSource.MANUAL),
        ):
            user = (
                await db.execute(select(User).where(User.email == email))
            ).scalar_one()
            account = (
                await db.execute(
                    select(TraderDemoAccount).where(TraderDemoAccount.user_id == user.id)
                )
            ).scalar_one()
            sold = (
                await db.execute(
                    select(SoldAccount).where(SoldAccount.trader_demo_account_id == account.id)
                )
            ).scalar_one()

            assert account.provider is MarketProvider.KALSHI
            assert account.kalshi_market_tickers == KALSHI_TICKERS
            assert sold.issuance_source is source
            assert sold.provider is MarketProvider.KALSHI


def test_provisioned_account_trades_kalshi_with_rules_enforced(kalshi_mocks, client: TestClient) -> None:
    """Webhook-provisioned account program enforces stake limits on Kalshi virtual bets."""
    email = "trader-kalshi-flow@example.com"

    provision = client.post(
        "/api/v1/webhooks/accounts",
        headers=APEX_HEADERS,
        json={
            "email": email,
            "provider": "kalshi",
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
        "provider": "kalshi",
    }
    tickers = provision_body["kalshi_market_tickers"]
    user_id = provision_body["user_id"]

    store = get_trading_store()
    session = store.reset_session(
        "apex-flow",
        user_id,
        program,
        provider="kalshi",
        kalshi_market_tickers=tickers,
        demo_account_id=account_id,
    )

    blocked = store.preview_order_risk(
        session,
        market_id=KALSHI_MARKET_ID,
        outcome="yes",
        side="buy",
        shares=1000,
        yes_price=0.55,
    )
    assert blocked["allowed"] is False
    assert any("per-pick limit" in r for r in blocked["reasons"])

    store.place_external_order(
        session,
        market_id=KALSHI_MARKET_ID,
        market_question="Bitcoin above 100k?",
        outcome="yes",
        side="buy",
        shares=50,
        yes_price=0.55,
        category="crypto",
    )

    session.external_markets[KALSHI_MARKET_ID]["yesPrice"] = 0.65
    store.sync_session_risk(session)

    prices = store.market_prices_for_session(session)
    snap = session.bankroll.mark_to_market(prices)
    assert snap.equity > program["starting_balance"]
    assert session.risk.status.value == "active"
    assert len(session.equity_curve) > 0

    program_dict = session.bankroll.positions()
    assert len(program_dict) == 1
    assert program_dict[0].market_id == KALSHI_MARKET_ID