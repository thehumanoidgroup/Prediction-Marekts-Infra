import { NextRequest, NextResponse } from "next/server";
import { fetchBackendMarkets } from "@/lib/api-server";
import { listHybridMarkets } from "@/lib/hybrid-markets";
import type { MarketFilters } from "@/lib/services";
import type { MarketCategory, MarketViewSource } from "@/lib/types";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  const params = request.nextUrl.searchParams;
  const source = (params.get("source") as MarketViewSource | null) ?? "all";
  const filters: MarketFilters = {
    category: (params.get("category") as MarketCategory | null) ?? "all",
    query: params.get("q") ?? "",
    sort: (params.get("sort") as MarketFilters["sort"]) ?? "volume",
  };

  const remote = await fetchBackendMarkets(tenant.slug, { ...filters, source });
  if (remote) return NextResponse.json(remote);

  return NextResponse.json(listHybridMarkets({ ...filters, source }));
}
