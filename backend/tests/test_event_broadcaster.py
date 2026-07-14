"""Tests for real-time event broadcasting and WebSocket rooms."""

from unittest.mock import AsyncMock, patch

import pytest

from app.ws.manager import ConnectionManager, DEFAULT_ROOM
from realtime.event_broadcaster import (
    broadcast_new_event,
    broadcast_price_update,
    broadcast_status_change,
    broadcast_volume_update,
    category_room,
    event_room,
)


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send_text(self, payload: str) -> None:
        self.sent.append(payload)


@pytest.mark.asyncio
async def test_room_helpers():
    assert category_room("crypto") == "category:crypto"
    assert event_room("evt-1") == "event:evt-1"


@pytest.mark.asyncio
async def test_connection_manager_room_filtering():
    manager = ConnectionManager()
    all_socket = _FakeWebSocket()
    crypto_socket = _FakeWebSocket()

    manager._connections["app"].add(all_socket)
    manager._connections["app"].add(crypto_socket)
    manager._socket_rooms[all_socket] = {DEFAULT_ROOM}
    manager._socket_rooms[crypto_socket] = {category_room("crypto")}

    await manager._deliver_local(
        "app",
        {
            "type": "price_update",
            "event_id": "evt-1",
            "data": {"probabilities": {"yes": 0.6, "no": 0.4}},
            "_rooms": [DEFAULT_ROOM, category_room("crypto"), event_room("evt-1")],
        },
    )

    assert len(all_socket.sent) == 1
    assert len(crypto_socket.sent) == 1
    assert '"type": "price_update"' in all_socket.sent[0]

    stocks_socket = _FakeWebSocket()
    manager._connections["app"].add(stocks_socket)
    manager._socket_rooms[stocks_socket] = {category_room("stocks")}

    await manager._deliver_local(
        "app",
        {
            "type": "status_change",
            "event_id": "evt-2",
            "data": {"status": "resolved"},
            "_rooms": [category_room("crypto")],
        },
    )

    assert len(stocks_socket.sent) == 0
    assert len(all_socket.sent) == 1
    assert len(crypto_socket.sent) == 2


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe():
    manager = ConnectionManager()
    socket = _FakeWebSocket()
    manager._connections["app"].add(socket)
    manager._socket_rooms[socket] = {DEFAULT_ROOM}

    active = await manager.subscribe(socket, [category_room("crypto"), event_room("evt-1")])
    assert category_room("crypto") in active
    assert event_room("evt-1") in active

    active = await manager.unsubscribe(socket, [category_room("crypto")])
    assert category_room("crypto") not in active
    assert event_room("evt-1") in active


@pytest.mark.asyncio
async def test_broadcast_price_update_message_shape():
    with patch("realtime.event_broadcaster.batcher.enqueue", AsyncMock()) as enqueue:
        await broadcast_price_update(
            "evt-1",
            probabilities={"yes": 0.62, "no": 0.38},
            category="crypto",
            external_id="mkt-1",
            change_24h=0.03,
            source="internal",
            tenant_slugs=["app"],
        )

    enqueue.assert_awaited_once()
    slug, payload = enqueue.await_args.args
    rooms = enqueue.await_args.kwargs["rooms"]
    assert slug == "app"
    assert payload["type"] == "price_update"
    assert payload["event_id"] == "evt-1"
    assert payload["data"]["probabilities"]["yes"] == 0.62
    assert category_room("crypto") in rooms
    assert event_room("evt-1") in rooms
    assert event_room("mkt-1") in rooms


@pytest.mark.asyncio
async def test_broadcast_status_change_message_shape():
    with patch("realtime.event_broadcaster.batcher.enqueue", AsyncMock()) as enqueue:
        await broadcast_status_change(
            "evt-2",
            status="resolved",
            previous_status="open",
            category="economics",
            external_id="mkt-11",
            tenant_slugs=["app"],
        )

    payload = enqueue.await_args.args[1]
    assert payload["type"] == "status_change"
    assert payload["data"]["status"] == "resolved"
    assert payload["data"]["previous_status"] == "open"


@pytest.mark.asyncio
async def test_broadcast_volume_update_message_shape():
    with patch("realtime.event_broadcaster.batcher.enqueue", AsyncMock()) as enqueue:
        await broadcast_volume_update(
            "evt-3",
            volume=125_000,
            volume_24h=8_500,
            volume_delta=1_200,
            category="stocks",
            external_id="mkt-4",
            tenant_slugs=["app"],
        )

    payload = enqueue.await_args.args[1]
    assert payload["type"] == "new_event"
    assert payload["data"]["volume"] == 125_000
    assert payload["data"]["volume_delta"] == 1_200


@pytest.mark.asyncio
async def test_broadcast_new_event_message_shape():
    with patch("realtime.event_broadcaster.batcher.enqueue", AsyncMock()) as enqueue:
        await broadcast_new_event(
            "evt-4",
            question="Will BTC reach 200K?",
            category="crypto",
            status="open",
            probabilities={"yes": 0.4, "no": 0.6},
            source="polymarket",
            external_id="poly-abc",
            tenant_slugs=["app"],
        )

    payload = enqueue.await_args.args[1]
    assert payload["type"] == "new_event"
    assert payload["data"]["question"] == "Will BTC reach 200K?"
    assert payload["data"]["source"] == "polymarket"
