import { NextResponse } from "next/server";
import { getKalshiIntegrationStatus } from "@/lib/kalshi/service";

export async function GET() {
  return NextResponse.json(await getKalshiIntegrationStatus());
}
