# Real-time live event feed

TypeScript/WebSocket equivalent of the requested `backend/realtime/websocket_manager.py` and `backend/realtime/event_broadcaster.py`.

PropPredict runs as a single Next.js app. WebSockets are served by a **standalone Node process** (`server/realtime-ws.ts`) because Vercel serverless functions do not support persistent WebSocket connections.

## Architecture

```
┌─────────────┐     publish      ┌──────────────┐     subscribe    ┌──────────────────┐
│ Next.js API │ ───────────────► │ Redis pub/sub │ ◄────────────── │ realtime-ws.ts   │
│ / orders    │                  │ (or memory)   │                 │ WebSocketManager │
└─────────────┘                  └──────────────┘                 └────────┬─────────┘
                                                                              │ WS
                                                                     ┌────────▼─────────┐
                                                                     │ Browser clients  │
                                                                     │ LivePricesProvider│
                                                                     └──────────────────┘
```

## Modules

| File | Role |
| --- | --- |
| `lib/realtime/websocket-manager.ts` | Connection lifecycle, subscriptions, heartbeats |
| `lib/realtime/event-broadcaster.ts` | Publish events to Redis channels |
| `lib/realtime/redis.ts` | Redis pub/sub with in-memory fallback |
| `lib/realtime/protocol.ts` | Client/server message schemas |
| `server/realtime-ws.ts` | WebSocket server process |

## Subscriptions

Clients send JSON messages:

```json
{ "op": "subscribe", "scope": "all" }
{ "op": "subscribe", "scope": "category", "category": "crypto" }
{ "op": "subscribe", "scope": "market", "marketId": "mkt-1" }
{ "op": "subscribe", "scope": "event", "eventType": "price_update" }
{ "op": "unsubscribe", "scope": "market", "marketId": "mkt-1" }
{ "op": "ping" }
```

Server pushes:

```json
{ "type": "event", "event": { "type": "price_update", "marketId": "mkt-1", "yesPrice": 0.52, ... } }
```

## Run locally

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run realtime
```

Set in `.env.local`:

```
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:3001/realtime
REALTIME_WS_PORT=3001
```

Health: `GET /api/realtime/health` and `GET http://localhost:3001/health`

## Production notes

- Deploy `server/realtime-ws.ts` as a long-running service (Railway, Fly.io, ECS, etc.)
- Point `NEXT_PUBLIC_REALTIME_WS_URL` at the public WebSocket URL
- Use Redis (Upstash, ElastiCache) for multi-instance fan-out
- Without Redis, the in-memory bus works for single-instance dev only
