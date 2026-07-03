import { NextRequest, NextResponse } from "next/server";
import { fetchBackendPolymarketMarkets } from "@/lib/api-server";
import { getMockPolymarketMarkets } from "@/lib/polymarket-mock";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const active = params.get("active") === "true";
  const refresh = params.get("refresh") === "true";
  const category = params.get("category") ?? "all";
  const sort = params.get("sort") ?? "volume";
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");

  const remote = await fetchBackendPolymarketMarkets({
    query,
    active,
    refresh,
    category,
    sort,
    page,
    pageSize,
  });
  if (remote) return NextResponse.json(remote);

  const markets = getMockPolymarketMarkets({ query, active });
  const start = (page - 1) * pageSize;
  const slice = markets.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(markets.length / pageSize));

  return NextResponse.json({
    markets: slice,
    pagination: {
      page,
      pageSize,
      total: markets.length,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    ...(query ? { query } : {}),
  });
}
