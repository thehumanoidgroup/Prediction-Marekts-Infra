import { NextResponse } from "next/server";
import { getRedisPubSub } from "@/lib/realtime/redis";

/** Health check for the real-time feed (Redis + WebSocket server). */
export async function GET() {
  const pubSub = await getRedisPubSub();
  const redisOk = await pubSub.ping();

  const wsPort = process.env.REALTIME_WS_PORT ?? "3001";
  const wsPath = process.env.REALTIME_WS_PATH ?? "/realtime";
  const wsHealthUrl = `http://127.0.0.1:${wsPort}/health`;

  let wsServer: { status: string; connections?: number } = { status: "unknown" };
  try {
    const response = await fetch(wsHealthUrl, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) {
      wsServer = await response.json();
    } else {
      wsServer = { status: "unreachable" };
    }
  } catch {
    wsServer = { status: "offline" };
  }

  return NextResponse.json({
    redis: {
      backend: pubSub.backend,
      connected: redisOk,
    },
    websocket: {
      url: process.env.NEXT_PUBLIC_REALTIME_WS_URL ?? `ws://localhost:${wsPort}${wsPath}`,
      server: wsServer,
    },
  });
}
