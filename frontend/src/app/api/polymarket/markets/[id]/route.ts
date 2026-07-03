import { NextRequest, NextResponse } from "next/server";
import { fetchBackendPolymarketMarket } from "@/lib/api-server";
import { getMockPolymarketMarket } from "@/lib/polymarket-mock";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const remote = await fetchBackendPolymarketMarket(id);
  if (remote) return NextResponse.json(remote);

  const market = getMockPolymarketMarket(id);
  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  return NextResponse.json({ market });
}
