import { NextRequest, NextResponse } from "next/server";
import { listFallbackLiveEvents } from "@/lib/live-events";
import type { MarketCategory, MarketViewSource } from "@/types";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = (params.get("category") as MarketCategory | null) ?? "all";
  const source = (params.get("source") as MarketViewSource | null) ?? "all";

  return NextResponse.json(listFallbackLiveEvents({ category, source }));
}
