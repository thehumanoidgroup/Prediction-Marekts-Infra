import { NextResponse } from "next/server";
import { getPolymarketIntegrationStatus } from "@/lib/polymarket/service";

export async function GET() {
  const status = await getPolymarketIntegrationStatus();
  return NextResponse.json(status);
}
