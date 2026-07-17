import { NextRequest, NextResponse } from "next/server";

/**
 * Back-compat portfolio endpoint — proxies to the live trader portfolio BFF.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const target = new URL("/api/trader/portfolio", url.origin);
  const headers = new Headers(request.headers);
  headers.delete("host");

  const response = await fetch(target, {
    headers,
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  return NextResponse.json(body, { status: response.status });
}
