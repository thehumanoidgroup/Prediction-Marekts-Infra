import type { MarketFilters } from "@/services";
import { listMarkets } from "@/services";
import type { Market, MarketViewSource } from "@/types";
import {
  getActivePolymarketMarkets,
  getAllPolymarketMarkets,
  getPolymarketMarketById,
} from "@/lib/polymarket/service";

function sortMarkets(markets: Market[], sort: MarketFilters["sort"] = "volume"): Market[] {
  const result = [...markets];
  switch (sort) {
    case "closing":
      result.sort((a, b) => a.closesAt - b.closesAt);
      break;
    case "movers":
      result.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
      break;
    case "newest":
      result.sort((a, b) => b.closesAt - a.closesAt);
      break;
    default:
      result.sort((a, b) => (b.volume24h || b.volume) - (a.volume24h || a.volume));
  }
  return result;
}

export async function listHybridMarkets(
  filters: MarketFilters & { source?: MarketViewSource; refresh?: boolean } = {},
): Promise<{
  markets: Market[];
  source: MarketViewSource;
  counts: { internal: number; polymarket: number; kalshi: number };
}> {
  const source = filters.source ?? "all";
  const { category = "all", query = "", sort = "volume", refresh = false } = filters;

  let markets: Market[] = [];

  if (source === "internal" || source === "all") {
    markets.push(
      ...listMarkets({
        category: source === "all" ? "all" : category,
        query: source === "all" ? "" : query,
        sort: "volume",
      }),
    );
  }

  if (source === "polymarket" || source === "all") {
    const poly =
      filters.source === "polymarket" && query.trim()
        ? (await import("@/lib/polymarket/service")).searchPolymarketMarkets(query, refresh)
        : source === "all"
          ? getAllPolymarketMarkets(refresh)
          : getActivePolymarketMarkets(refresh);
    markets.push(...(await poly));
  }

  if (source === "kalshi" || source === "all") {
    try {
      const { searchKalshiMarkets, getActiveKalshiMarkets } = await import("@/lib/kalshi/service");
      const kalshi =
        source === "kalshi" && query.trim()
          ? await searchKalshiMarkets(query, refresh)
          : await getActiveKalshiMarkets(refresh);
      markets.push(...kalshi);
    } catch {
      /* Kalshi public API unavailable — continue with other sources */
    }
  }

  if (source === "all") {
    if (category !== "all") {
      markets = markets.filter((market) => market.category === category);
    }
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      markets = markets.filter((market) => market.question.toLowerCase().includes(needle));
    }
    markets = sortMarkets(markets, sort);
  } else if (source === "polymarket" || source === "kalshi") {
    if (category !== "all") {
      markets = markets.filter((market) => market.category === category);
    }
    if (query.trim() && source === "polymarket") {
      const needle = query.trim().toLowerCase();
      markets = markets.filter((market) => market.question.toLowerCase().includes(needle));
    }
    markets = sortMarkets(markets, sort);
  }

  const counts = {
    internal: markets.filter((market) => market.source === "internal").length,
    polymarket: markets.filter((market) => market.source === "polymarket").length,
    kalshi: markets.filter((market) => market.source === "kalshi").length,
  };

  return { markets, source, counts };
}

export async function getHybridMarket(marketId: string): Promise<Market | null> {
  const internal = listMarkets().find((m) => m.id === marketId);
  if (internal) return internal;

  if (marketId.startsWith("poly-") || marketId.startsWith("0x")) {
    return getPolymarketMarketById(marketId);
  }

  if (marketId.toLowerCase().startsWith("kalshi-")) {
    const { getKalshiMarketById } = await import("@/lib/kalshi/service");
    return getKalshiMarketById(marketId);
  }

  return null;
}
