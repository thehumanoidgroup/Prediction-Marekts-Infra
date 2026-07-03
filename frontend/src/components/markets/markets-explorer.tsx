"use client";

import { Suspense, useMemo } from "react";
import type { Market, PolymarketMarket } from "@/lib/types";
import { formatCompactUsd } from "@/lib/format";
import { MarketCard } from "@/components/markets/market-card";
import { MarketFilters } from "@/components/markets/market-filters";
import {
  MarketSourceToggle,
  useMarketSource,
} from "@/components/markets/market-source-toggle";
import { PolymarketMarketCard } from "@/components/markets/polymarket-market-card";
import { usePolymarketMarkets } from "@/lib/hooks/use-polymarket-markets";
import { useSearchParams } from "next/navigation";

function filterInternalMarkets(
  markets: Market[],
  filters: { category: string; query: string; sort: string },
): Market[] {
  let result = [...markets];

  if (filters.category !== "all") {
    result = result.filter((market) => market.category === filters.category);
  }

  if (filters.query.trim()) {
    const needle = filters.query.trim().toLowerCase();
    result = result.filter((market) => market.question.toLowerCase().includes(needle));
  }

  switch (filters.sort) {
    case "movers":
      result.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
      break;
    case "closing":
      result.sort((a, b) => a.closesAt - b.closesAt);
      break;
    default:
      result.sort((a, b) => b.volume24h - a.volume24h);
  }

  return result;
}

function filterPolymarketMarkets(
  markets: Market[],
  category: string,
  sort: string,
): Market[] {
  let result = [...markets];

  if (category !== "all") {
    result = result.filter((market) => market.category === category);
  }

  switch (sort) {
    case "movers":
      result.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
      break;
    case "closing":
      result.sort((a, b) => a.closesAt - b.closesAt);
      break;
    default:
      result.sort((a, b) => (b.volume24h || b.volume) - (a.volume24h || a.volume));
  }

  return result;
}

function MarketsExplorerBody({ internalMarkets }: { internalMarkets: Market[] }) {
  const source = useMarketSource();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "volume";
  const query = searchParams.get("q") ?? "";

  const polymarket = usePolymarketMarkets(
    { query, active: false },
    { enabled: source === "polymarket" },
  );

  const internalFiltered = useMemo(
    () => filterInternalMarkets(internalMarkets, { category, query, sort }),
    [category, internalMarkets, query, sort],
  );

  const polymarketFiltered = useMemo(() => {
    if (polymarket.markets.status !== "success") return [];
    return filterPolymarketMarkets(polymarket.markets.data, category, sort);
  }, [category, polymarket.markets, sort]);

  const markets = source === "polymarket" ? polymarketFiltered : internalFiltered;
  const totalVolume = markets.reduce((sum, market) => sum + (market.volume24h || market.volume), 0);
  const isLoading = source === "polymarket" && polymarket.markets.status === "loading";
  const isError = source === "polymarket" && polymarket.markets.status === "error";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {source === "polymarket" ? "Polymarket Markets" : "Markets"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {isLoading
              ? "Loading Polymarket feed…"
              : `${markets.length} markets · ${formatCompactUsd(totalVolume)} volume`}
            {source === "polymarket" && polymarket.refreshing ? " · updating" : ""}
          </p>
        </div>
        <MarketSourceToggle />
      </div>

      <MarketFilters hideSort={source === "polymarket" && polymarket.markets.status === "loading"} />

      {isError && polymarket.markets.status === "error" ? (
        <div className="rounded-card border border-down/30 bg-down-soft px-4 py-6 text-center">
          <p className="text-sm font-medium text-down">{polymarket.markets.error}</p>
          <button
            type="button"
            onClick={() => polymarket.reload()}
            className="mt-3 text-sm font-semibold text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-64 animate-pulse rounded-card border border-edge bg-surface"
            />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-card border border-edge bg-surface py-16 text-center">
          <p className="text-sm text-muted">No markets match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {source === "polymarket"
            ? markets.map((market) => (
                <PolymarketMarketCard key={market.id} market={market as PolymarketMarket} />
              ))
            : markets.map((market) => <MarketCard key={market.id} market={market} />)}
        </div>
      )}
    </>
  );
}

export function MarketsExplorer({ internalMarkets }: { internalMarkets: Market[] }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-card border border-edge bg-surface" />
        }
      >
        <MarketsExplorerBody internalMarkets={internalMarkets} />
      </Suspense>
    </div>
  );
}
