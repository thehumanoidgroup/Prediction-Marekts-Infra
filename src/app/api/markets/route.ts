import { NextRequest, NextResponse } from "next/server";
import { listMarkets, type MarketFilters } from "@/lib/services";
import type { MarketCategory } from "@/lib/types";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters: MarketFilters = {
    category: (params.get("category") as MarketCategory | null) ?? "all",
    query: params.get("q") ?? "",
    sort: (params.get("sort") as MarketFilters["sort"]) ?? "volume",
  };
  return NextResponse.json({ markets: listMarkets(filters) });
}
