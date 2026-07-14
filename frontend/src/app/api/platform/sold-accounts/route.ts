import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";

export async function GET() {
  const base = getBackendUrl();
  if (!base) {
    return NextResponse.json([]);
  }

  try {
    const response = await fetch(`${base}/api/v1/platform/sold-accounts?limit=200`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to load sold accounts" }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
