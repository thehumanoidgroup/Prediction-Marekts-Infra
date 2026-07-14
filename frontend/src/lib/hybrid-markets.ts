import type { Market, MarketViewSource } from "@/lib/types";
import { getMockPolymarketMarkets } from "@/lib/polymarket-mock";
import type { MarketFilters } from "@/lib/services";
import { listMarkets } from "@/lib/services";

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

/** Client-side hybrid listing used when the backend API is unavailable. */
export function listHybridMarkets(
  filters: MarketFilters & { source?: MarketViewSource } = {},
): { markets: Market[]; source: MarketViewSource; counts: { internal: number; polymarket: number; kalshi: number } } {
  const source = filters.source ?? "all";
  const { category = "all", query = "", sort = "volume" } = filters;

  let markets: Market[] = [];

  if (source === "internal" || source === "all") {
    markets.push(...listMarkets({ category: source === "all" ? "all" : category, query: source === "all" ? "" : query, sort: "volume" }));
  }

  if (source === "polymarket" || source === "all") {
    markets.push(...getMockPolymarketMarkets({ query, active: false }));
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
  } else if (source === "polymarket") {
    if (category !== "all") {
      markets = markets.filter((market) => market.category === category);
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
