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

  if (source === "kalshi") {
    const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (base) {
      try {
        const params = new URLSearchParams({ source: "kalshi", sort, category });
        if (query.trim()) params.set("q", query.trim());
        const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/trading/markets?${params}`, {
          headers: { "X-Tenant-Slug": "app" },
          cache: "no-store",
        });
        if (response.ok) {
          const data = (await response.json()) as { markets?: Market[] };
          markets.push(...(data.markets ?? []));
        }
      } catch {
        /* Kalshi feed unavailable without backend */
      }
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
    const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (base) {
      try {
        const response = await fetch(
          `${base.replace(/\/$/, "")}/api/v1/trading/markets/${encodeURIComponent(marketId)}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const data = (await response.json()) as { market?: Market };
          return data.market ?? null;
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}
