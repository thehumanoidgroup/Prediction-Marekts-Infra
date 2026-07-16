"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { formatCompactUsd } from "@/lib/format";
import { useHybridMarkets } from "@/hooks/use-hybrid-markets";
import type { MarketViewSource } from "@/lib/types";
import type { MarketFilters as MarketFilterParams } from "@/lib/services";
import { MarketFilters } from "@/components/markets/market-filters";
import { MarketListingCard } from "@/components/markets/market-listing-card";
import {
  MarketSourceToggle,
  useMarketSource,
} from "@/components/markets/market-source-toggle";

function sourceTitle(source: MarketViewSource): string {
  switch (source) {
    case "internal":
      return "Internal Markets";
    case "polymarket":
      return "Polymarket Markets";
    case "kalshi":
      return "Kalshi Markets";
    case "sp500_dynamic":
      return "S&P 500 Markets";
    default:
      return "All Markets";
  }
}

function MarketsExplorerBody() {
  const source = useMarketSource();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") ?? "all";
  const sort = (searchParams.get("sort") ?? "volume") as MarketFilterParams["sort"];
  const query = searchParams.get("q") ?? "";

  const { payload, refreshing, reload } = useHybridMarkets({
    source,
    category: category as MarketFilterParams["category"],
    query,
    sort,
  });

  const isLoading = payload.status === "loading";
  const isError = payload.status === "error";
  const data = payload.status === "success" ? payload.data : null;
  const markets = data?.markets ?? [];
  const counts = data?.counts;
  const totalVolume = markets.reduce((sum, market) => sum + (market.volume24h || market.volume), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{sourceTitle(source)}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {isLoading
              ? "Loading markets…"
              : `${markets.length} markets · ${formatCompactUsd(totalVolume)} volume`}
            {counts && source === "all"
              ? ` · ${counts.internal} LMSR · ${counts.polymarket} Polymarket · ${counts.kalshi ?? 0} Kalshi · ${counts.sp500_dynamic ?? 0} S&P 500`
              : ""}
            {refreshing ? " · updating" : ""}
          </p>
        </div>
        <MarketSourceToggle />
      </div>

      <MarketFilters hideSort={isLoading} />

      {isError ? (
        <div className="rounded-card border border-down/30 bg-down-soft px-4 py-6 text-center">
          <p className="text-sm font-medium text-down">{payload.error}</p>
          <button
            type="button"
            onClick={() => reload()}
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
          {markets.map((market) => (
            <MarketListingCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </>
  );
}

export function MarketsExplorer() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-card border border-edge bg-surface" />
        }
      >
        <MarketsExplorerBody />
      </Suspense>
    </div>
  );
}
