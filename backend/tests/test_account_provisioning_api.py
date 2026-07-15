"""API route tests for account provisioning (admin + webhook)."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

APEX_HEADERS = {"X-Tenant-Slug": "apex"}


def test_admin_provision_kalshi_account(client: TestClient) -> None:
    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-25", "KXFED-25"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        response = client.post(
            "/api/v1/admin/accounts/provision",
            headers=APEX_HEADERS,
            json={
                "email": "kalshi-api-new@example.com",
                "provider": "kalshi",
                "account_size": 25_000,
                "model_type": "2step",
                "challenge_rules": {
                    "profit_target_pct": 12,
                    "max_daily_loss_pct": 4,
                },
            },
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "created"
    assert body["provider"] == "kalshi"
    assert body["account_id"] == body["trader_demo_account_id"]
    assert body["kalshi_live_integration_enabled"] is True
    assert body["kalshi_market_tickers"] == ["KXBTC-25", "KXFED-25"]
    assert body["model_type"] == "2step"
    assert body["applied_rules"]["profit_target_pct"] == 12
    assert "kalshi-api-new@example.com" in body["message"]


def test_webhook_provision_kalshi_with_challenge_rules(client: TestClient) -> None:
    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-25"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        response = client.post(
            "/api/v1/webhooks/accounts",
            headers=APEX_HEADERS,
            json={
                "email": "webhook-kalshi@example.com",
                "provider": "kalshi",
                "account_size": 50_000,
                "model_type": "instant",
                "external_order_id": "order-abc-123",
                "challenge_rules": {"profit_split_pct": 85},
            },
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["provider"] == "kalshi"
    assert body["account_id"]
    assert body["trader_demo_account_id"] == body["account_id"]
    assert body["kalshi_live_integration_enabled"] is True
    assert body["model_type"] == "instant"
    assert body["applied_rules"]["profit_split_pct"] == 85


def test_webhook_defaults_provider_to_kalshi(client: TestClient) -> None:
    with patch(
        "services.account_provisioning.fetch_kalshi_live_markets",
        return_value=["KXBTC-25"],
    ), patch(
        "services.account_provisioning.send_account_credentials_email",
        return_value=True,
    ):
        response = client.post(
            "/api/v1/webhooks/accounts",
            headers=APEX_HEADERS,
            json={
                "email": "webhook-default@example.com",
                "account_size": 10_000,
            },
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["provider"] == "kalshi"
    assert body["kalshi_live_integration_enabled"] is True
