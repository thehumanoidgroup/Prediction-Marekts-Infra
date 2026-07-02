import { NextRequest, NextResponse } from "next/server";
import { getMarket } from "@/lib/services";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const market = getMarket(id);
  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  return NextResponse.json({ market });
}
