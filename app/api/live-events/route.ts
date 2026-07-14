import { NextRequest, NextResponse } from "next/server";
import { fetchBackendLiveEvents } from "@/lib/api-server";
import { listFallbackLiveEvents } from "@/lib/live-events";
import type { MarketCategory, MarketViewSource } from "@/lib/types";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  const params = request.nextUrl.searchParams;
  const category = (params.get("category") as MarketCategory | null) ?? "all";
  const source = (params.get("source") as MarketViewSource | null) ?? "all";

  const remote = await fetchBackendLiveEvents(tenant.slug, { category, source });
  if (remote) return NextResponse.json(remote);

  return NextResponse.json(listFallbackLiveEvents({ category, source }));
}
