import { NextRequest, NextResponse } from "next/server";
import { listHybridMarkets } from "@/lib/hybrid-markets";
import type { MarketFilters } from "@/services";
import type { MarketCategory, MarketViewSource } from "@/types";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  getTenantFromRequest(request);
  const params = request.nextUrl.searchParams;
  const source = (params.get("source") as MarketViewSource | null) ?? "all";
  const filters: MarketFilters = {
    category: (params.get("category") as MarketCategory | null) ?? "all",
    query: params.get("q") ?? "",
    sort: (params.get("sort") as MarketFilters["sort"]) ?? "volume",
  };
  const refresh = params.get("refresh") === "true";

  const payload = await listHybridMarkets({ ...filters, source, refresh });
  return NextResponse.json(payload);
}
