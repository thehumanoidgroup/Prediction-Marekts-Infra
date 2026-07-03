"""Trading API smoke tests."""

import pytest
from fastapi.testclient import TestClient

HEADERS = {"X-Tenant-Slug": "app"}


def test_list_markets(client: TestClient):
    response = client.get("/api/v1/trading/markets", headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert "markets" in data
    assert len(data["markets"]) >= 4
    assert "yesPrice" in data["markets"][0]


def test_portfolio_and_order(client: TestClient):
    portfolio = client.get("/api/v1/trading/portfolio", headers=HEADERS)
    assert portfolio.status_code == 200
    body = portfolio.json()
    assert body["account"]["equity"] > 0
    assert "summary" in body

    order = client.post(
        "/api/v1/trading/orders",
        headers=HEADERS,
        json={"marketId": "mkt-1", "outcome": "yes", "side": "buy", "shares": 50},
    )
    assert order.status_code == 201
    assert order.json()["order"]["marketId"] == "mkt-1"

    after = client.get("/api/v1/trading/portfolio", headers=HEADERS)
    assert after.json()["account"]["balance"] < body["account"]["balance"]


def test_journal_note(client: TestClient):
    response = client.post(
        "/api/v1/trading/journal",
        headers=HEADERS,
        json={"note": "Test journal entry from API", "tags": ["test"]},
    )
    assert response.status_code == 201
    assert response.json()["entry"]["kind"] == "note"
