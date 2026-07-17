"""Portfolio WebSocket broadcast tests (new_position / portfolio_update)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

HEADERS = {"X-Tenant-Slug": "app"}


def test_order_broadcasts_new_position(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    captured: list[dict] = []

    async def fake_broadcast_new_position(tenant_slug, **kwargs):
        captured.append({"fn": "new_position", "tenant": tenant_slug, **kwargs})

    async def fake_broadcast_portfolio_update(tenant_slug, **kwargs):
        captured.append({"fn": "portfolio_update", "tenant": tenant_slug, **kwargs})

    monkeypatch.setattr(
        "realtime.portfolio_events.broadcast_new_position",
        fake_broadcast_new_position,
    )
    monkeypatch.setattr(
        "realtime.portfolio_events.broadcast_portfolio_update",
        fake_broadcast_portfolio_update,
    )
    # trading.py imports inside the handler — patch the module used at call time
    monkeypatch.setattr(
        "app.api.routes.trading.broadcast_new_position",
        fake_broadcast_new_position,
        raising=False,
    )

    # Patch where the handler imports from
    import realtime.portfolio_events as pe

    monkeypatch.setattr(pe, "broadcast_new_position", fake_broadcast_new_position)
    monkeypatch.setattr(pe, "broadcast_portfolio_update", fake_broadcast_portfolio_update)

    order = client.post(
        "/api/v1/trading/orders",
        headers=HEADERS,
        json={"marketId": "mkt-1", "outcome": "yes", "side": "buy", "shares": 20},
    )
    assert order.status_code == 201
    body = order.json()
    assert body["position"]["marketId"] == "mkt-1"
    assert "summary" in body

    assert any(item["fn"] == "new_position" for item in captured)
    event = next(item for item in captured if item["fn"] == "new_position")
    assert event["tenant"] == "app"
    assert event["position"]["marketId"] == "mkt-1"
    assert event["reason"] == "order_filled"


def test_sell_broadcasts_portfolio_update(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    captured: list[dict] = []

    async def fake_broadcast_new_position(tenant_slug, **kwargs):
        captured.append({"fn": "new_position", "tenant": tenant_slug, **kwargs})

    async def fake_broadcast_portfolio_update(tenant_slug, **kwargs):
        captured.append({"fn": "portfolio_update", "tenant": tenant_slug, **kwargs})

    import realtime.portfolio_events as pe

    monkeypatch.setattr(pe, "broadcast_new_position", fake_broadcast_new_position)
    monkeypatch.setattr(pe, "broadcast_portfolio_update", fake_broadcast_portfolio_update)

    buy = client.post(
        "/api/v1/trading/orders",
        headers=HEADERS,
        json={"marketId": "mkt-2", "outcome": "yes", "side": "buy", "shares": 15},
    )
    assert buy.status_code == 201
    captured.clear()

    sell = client.post(
        "/api/v1/trading/orders",
        headers=HEADERS,
        json={"marketId": "mkt-2", "outcome": "yes", "side": "sell", "shares": 15},
    )
    assert sell.status_code == 201
    assert any(item["fn"] == "portfolio_update" for item in captured)
    event = next(item for item in captured if item["fn"] == "portfolio_update")
    assert event["reason"] == "position_closed"


def test_portfolio_events_notify_endpoint(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    captured: list[dict] = []

    async def fake_broadcast_new_position(tenant_slug, **kwargs):
        captured.append({"tenant": tenant_slug, **kwargs})

    monkeypatch.setattr(
        "app.api.routes.trader.broadcast_new_position",
        fake_broadcast_new_position,
    )

    response = client.post(
        "/api/trader/portfolio/events",
        headers=HEADERS,
        json={
            "eventType": "new_position",
            "reason": "order_filled",
            "position": {
                "id": "pos-mkt-1-yes",
                "marketId": "mkt-1",
                "outcome": "yes",
                "shares": 10,
                "avgPrice": 0.4,
                "openedAt": 1,
                "currentPrice": 0.4,
                "value": 4,
                "cost": 4,
                "pnl": 0,
                "pnlPct": 0,
                "market": {"id": "mkt-1", "question": "Test", "yesPrice": 0.4, "source": "internal"},
            },
        },
    )
    assert response.status_code == 202
    assert response.json()["ok"] is True
    assert len(captured) == 1
    assert captured[0]["position"]["marketId"] == "mkt-1"


def test_user_room_helper():
    from realtime.portfolio_events import user_room
    from realtime.event_broadcaster import user_room as eb_user_room

    assert user_room("abc") == "user:abc"
    assert eb_user_room("abc") == "user:abc"
