import { NextResponse } from "next/server";

/** In-process live feed monitor stub for the Vercel-only deployment. */
export async function GET() {
  return NextResponse.json({
    connections: { total_connections: 0, connections_by_tenant: {}, sockets: [] },
    analytics: {
      total_connections: 0,
      connections_by_tenant: {},
      updates_per_minute: 0,
      tracked_events: 0,
      uptime_seconds: 0,
      top_viewed_events: [],
    },
    events: {
      count: 0,
      counts_by_source: { internal: 0, polymarket: 0, kalshi: 0, external: 0 },
      active: [],
    },
  });
}
