import { NextRequest, NextResponse } from "next/server";
import { getPolymarketMarketById } from "@/lib/polymarket/service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const market = await getPolymarketMarketById(id);

  if (!market) {
    return NextResponse.json({ error: "Polymarket market not found" }, { status: 404 });
  }

  return NextResponse.json({ market });
}
