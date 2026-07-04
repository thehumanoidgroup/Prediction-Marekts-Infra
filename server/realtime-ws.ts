/**
 * Standalone WebSocket server for the PropPredict live event feed.
 *
 * Run alongside Next.js: `npm run realtime`
 * Connect clients to ws://localhost:3001/realtime (or REALTIME_WS_PORT)
 */

import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { EventBroadcaster } from "@/lib/realtime/event-broadcaster";
import { getRedisPubSub } from "@/lib/realtime/redis";
import type { RealtimeEvent } from "@/lib/realtime/types";
import { WebSocketManager } from "@/lib/realtime/websocket-manager";
import type { MarketCategory } from "@/lib/types";

const PORT = Number(process.env.REALTIME_WS_PORT ?? 3001);
const PATH = process.env.REALTIME_WS_PATH ?? "/realtime";
const TICK_MS = Number(process.env.REALTIME_PRICE_TICK_MS ?? 2_000);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

interface MarketSnapshot {
  id: string;
  category: MarketCategory;
  yesPrice: number;
  change24h: number;
}

function clientIp(request: IncomingMessage): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return request.socket.remoteAddress ?? null;
}

async function loadMarkets(): Promise<MarketSnapshot[]> {
  try {
    const response = await fetch(`${APP_URL.replace(/\/$/, "")}/api/markets?source=internal`);
    if (!response.ok) return [];
    const body = (await response.json()) as { markets?: MarketSnapshot[] };
    return body.markets ?? [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const manager = new WebSocketManager();
  const broadcaster = new EventBroadcaster();
  await broadcaster.init();
  const pubSub = await getRedisPubSub();

  manager.start();

  const prices = new Map<string, MarketSnapshot>();
  let markets = await loadMarkets();
  for (const market of markets) {
    prices.set(market.id, market);
  }

  const unsubscribeRedis = await pubSub.subscribe([{ scope: "all" }], (event: RealtimeEvent) => {
    manager.broadcast(event);
  });

  const tickTimer = setInterval(async () => {
    if (prices.size === 0) {
      markets = await loadMarkets();
      for (const market of markets) prices.set(market.id, market);
      if (prices.size === 0) return;
    }

    const ids = [...prices.keys()];
    const moves = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < moves; i += 1) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      const current = prices.get(id);
      if (!current) continue;
      const yesPrice = Math.min(0.97, Math.max(0.03, current.yesPrice + (Math.random() - 0.5) * 0.02));
      const updated = { ...current, yesPrice };
      prices.set(id, updated);
      await broadcaster.broadcastPriceUpdate({
        marketId: updated.id,
        marketCategory: updated.category,
        yesPrice: updated.yesPrice,
        change24h: updated.change24h,
      });
    }
  }, TICK_MS);

  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          connections: manager.getConnectionCount(),
          redis: pubSub.backend,
          markets: prices.size,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: PATH });

  wss.on("connection", (socket, request) => {
    manager.addConnection(socket as unknown as import("@/lib/realtime/websocket-manager").ManagedSocket, clientIp(request));
    socket.on("message", (data) => {
      manager.handleMessage(socket as unknown as import("@/lib/realtime/websocket-manager").ManagedSocket, data);
    });
  });

  server.listen(PORT, () => {
    console.info(`[realtime] WebSocket server listening on ws://0.0.0.0:${PORT}${PATH}`);
    console.info(`[realtime] Redis backend: ${pubSub.backend}`);
  });

  const shutdown = async () => {
    clearInterval(tickTimer);
    await unsubscribeRedis();
    manager.stop();
    await broadcaster.close();
    wss.close();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[realtime] Fatal error:", error);
  process.exit(1);
});
