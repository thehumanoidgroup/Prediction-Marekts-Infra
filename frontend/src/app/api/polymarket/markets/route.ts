import { NextRequest, NextResponse } from "next/server";
import { fetchBackendPolymarketMarkets } from "@/lib/api-server";
import { getMockPolymarketMarkets } from "@/lib/polymarket-mock";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const active = params.get("active") === "true";
  const refresh = params.get("refresh") === "true";

  const remote = await fetchBackendPolymarketMarkets({ query, active, refresh });
  if (remote) return NextResponse.json(remote);

  const markets = getMockPolymarketMarkets({ query, active });
  return NextResponse.json({ markets });
}
