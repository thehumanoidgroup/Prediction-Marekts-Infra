import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/markets/{tenant_slug}")
async def markets_feed(websocket: WebSocket, tenant_slug: str) -> None:
    """Real-time market data stream, one channel per tenant.

    Server → client: `price_tick` events from the ticker / matching engine.
    Client → server: `ping` keep-alives (answered with `pong`).
    """
    await manager.connect(tenant_slug, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(tenant_slug, websocket)
