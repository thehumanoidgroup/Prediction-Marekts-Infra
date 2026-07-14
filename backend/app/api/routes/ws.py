import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/markets/{tenant_slug}")
async def markets_feed(websocket: WebSocket, tenant_slug: str) -> None:
    """Real-time market data stream, one channel per tenant.

    Server → client:
    - ``price_update`` / ``status_change`` / ``new_event`` from the live event broadcaster
    - Legacy ``price_tick`` events from the ticker

    Client → server:
    - ``ping`` keep-alives (answered with ``pong``)
    - ``subscribe`` / ``unsubscribe`` for room-based filtering::

        {"type": "subscribe", "rooms": ["all", "category:crypto", "event:<id>"]}
        {"type": "unsubscribe", "rooms": ["category:crypto"]}
    """
    await manager.connect(tenant_slug, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = message.get("type")
            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            elif msg_type == "subscribe":
                rooms = message.get("rooms") or []
                active = await manager.subscribe(websocket, rooms)
                await websocket.send_text(
                    json.dumps({"type": "subscribed", "rooms": sorted(active)})
                )
            elif msg_type == "unsubscribe":
                rooms = message.get("rooms") or []
                active = await manager.unsubscribe(websocket, rooms)
                await websocket.send_text(
                    json.dumps({"type": "unsubscribed", "rooms": sorted(active)})
                )
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(tenant_slug, websocket)
