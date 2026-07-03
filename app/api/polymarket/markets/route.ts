import { NextRequest, NextResponse } from "next/server";
import {
  getActivePolymarketMarkets,
  getAllPolymarketMarkets,
  getPolymarketIntegrationStatus,
  getPolymarketMarketById,
  searchPolymarketMarkets,
} from "@/lib/polymarket/service";
import type { Market, MarketCategory } from "@/types";

type MarketSort = "volume" | "closing" | "newest" | "movers";
type MarketStatus = "open" | "closing_soon" | "resolved";

function applyFilters(
  markets: Market[],
  {
    category,
    status,
    activeOnly,
  }: { category: string; status: MarketStatus | null; activeOnly: boolean },
): Market[] {
  let result = markets;
  if (category && category !== "all") {
    result = result.filter((market) => market.category === category);
  }
  if (status) {
    result = result.filter((market) => market.status === status);
  }
  if (activeOnly) {
    result = result.filter(
      (market) =>
        market.acceptingOrders &&
        (market.status === "open" || market.status === "closing_soon"),
    );
  }
  return result;
}

function sortMarkets(markets: Market[], sort: MarketSort): Market[] {
  const sorted = [...markets];
  switch (sort) {
    case "movers":
      sorted.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
      break;
    case "closing":
      sorted.sort((a, b) => a.closesAt - b.closesAt);
      break;
    case "newest":
      sorted.sort((a, b) => b.closesAt - a.closesAt);
      break;
    default:
      sorted.sort((a, b) => (b.volume24h || b.volume) - (a.volume24h || a.volume));
  }
  return sorted;
}

function paginate(markets: Market[], page: number, pageSize: number) {
  const total = markets.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const safePage = totalPages > 0 ? Math.min(Math.max(page, 1), totalPages) : 1;
  const start = (safePage - 1) * pageSize;
  return {
    markets: markets.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1 && totalPages > 0,
    },
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = (params.get("category") as MarketCategory | null) ?? "all";
  const status = params.get("status") as MarketStatus | null;
  const active = params.get("active") === "true";
  const sort = (params.get("sort") as MarketSort | null) ?? "volume";
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  const refresh = params.get("refresh") === "true";

  const markets = active
    ? await getActivePolymarketMarkets(refresh)
    : await getAllPolymarketMarkets(refresh);

  const filtered = applyFilters(markets, { category, status, activeOnly: false });
  const sorted = sortMarkets(filtered, sort);
  return NextResponse.json(paginate(sorted, page, pageSize));
}
