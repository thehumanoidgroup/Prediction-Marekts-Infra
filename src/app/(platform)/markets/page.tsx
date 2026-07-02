import { Suspense } from "react";
import type { Metadata } from "next";
import { listMarkets, type MarketFilters as Filters } from "@/lib/services";
import type { MarketCategory } from "@/lib/types";
import { formatCompactUsd } from "@/lib/format";
import { MarketCard } from "@/components/markets/market-card";
import { MarketFilters } from "@/components/markets/market-filters";

export const metadata: Metadata = { title: "Markets" };

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters: Filters = {
    category: (typeof params.category === "string" ? params.category : "all") as
      | MarketCategory
      | "all",
    query: typeof params.q === "string" ? params.q : "",
    sort: (typeof params.sort === "string" ? params.sort : "volume") as Filters["sort"],
  };
  const markets = listMarkets(filters);
  const totalVolume = markets.reduce((sum, m) => sum + m.volume24h, 0);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Markets</h1>
          <p className="mt-0.5 text-sm text-muted">
            {markets.length} markets · {formatCompactUsd(totalVolume)} 24h volume
          </p>
        </div>
      </div>

      <Suspense>
        <MarketFilters />
      </Suspense>

      {markets.length === 0 ? (
        <div className="rounded-card border border-edge bg-surface py-16 text-center">
          <p className="text-sm text-muted">No markets match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
