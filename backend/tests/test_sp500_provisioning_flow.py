"""Webhook + manual provisioning for sp500_dynamic evaluation accounts."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import IssuanceSource, MarketProvider, SoldAccount, TraderDemoAccount

APEX_HEADERS = {"X-Tenant-Slug": "apex"}


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
    assert "S&P 500" in body["message"] or body["provider"] == "sp500_dynamic"

    async with SessionLocal() as db:
        result = await db.execute(
            select(TraderDemoAccount).where(TraderDemoAccount.starting_balance == 25_000)
        )
        accounts = list(result.scalars().all())
        match = [a for a in accounts if a.provider is MarketProvider.SP500_DYNAMIC]
        assert match, "expected sp500_dynamic trader demo account"
        assert match[0].provider is MarketProvider.SP500_DYNAMIC

        sold = await db.execute(
            select(SoldAccount).where(SoldAccount.trader_email == email)
        )
        row = sold.scalar_one()
        assert row.provider is MarketProvider.SP500_DYNAMIC
        assert row.issuance_source is IssuanceSource.WEBHOOK


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
