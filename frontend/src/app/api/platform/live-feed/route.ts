import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";

export async function GET() {
  const base = getBackendUrl();
  if (!base) {
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
      events: { count: 0, counts_by_source: { internal: 0, polymarket: 0, external: 0 }, active: [] },
    });
  }

  try {
    const response = await fetch(`${base}/api/v1/platform/live-feed`, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to load live feed monitor" }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
