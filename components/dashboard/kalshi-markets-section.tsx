"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { KalshiMarket, MarketCategory } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KalshiMarketCard } from "@/components/markets/kalshi-market-card";
import { cn } from "@/lib/utils";

type TimeFilter = "live" | "upcoming" | "all";

const TIME_TABS: { id: TimeFilter; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All" },
];

const CATEGORIES: { id: MarketCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sports", label: "Sports" },
  { id: "politics", label: "Politics" },
  { id: "economics", label: "Economics" },
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
  { id: "commodities", label: "Commodities" },
];

function filterByTime(markets: KalshiMarket[], filter: TimeFilter): KalshiMarket[] {
  const now = Date.now();
  const twoWeeks = 14 * 24 * 3_600_000;

  if (filter === "live") {
    return markets.filter(
      (m) => m.status === "open" || m.status === "closing_soon",
    );
  }
  if (filter === "upcoming") {
    return markets.filter((m) => m.status === "open" && m.closesAt - now > twoWeeks);
  }
  return markets;
}

/** Kalshi markets feed for traders on Kalshi-linked evaluation accounts. */
export function KalshiMarketsSection() {
  const [markets, setMarkets] = useState<KalshiMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("live");
  const [category, setCategory] = useState<MarketCategory | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ source: "kalshi", sort: "volume" });
      if (category !== "all") params.set("category", category);
      const response = await fetch(`/api/markets?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load Kalshi markets");
      const data = await response.json();
      setMarkets((data.markets ?? []) as KalshiMarket[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    let rows = filterByTime(markets, timeFilter);
    if (category !== "all") {
      rows = rows.filter((m) => m.category === category);
    }
    return rows.slice(0, 9);
  }, [markets, timeFilter, category]);

  return (
    <Card>
      <CardHeader
        title="Kalshi Markets"
        subtitle="Live prediction markets · virtual P&L only"
        action={
          <Link
            href="/markets?source=kalshi"
            className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
          >
            View all
          </Link>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {TIME_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTimeFilter(tab.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                timeFilter === tab.id
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-edge bg-surface-2 text-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                category === cat.id
                  ? "bg-surface-3 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-card border border-edge bg-surface-2" />
            ))}
          </div>
        ) : null}

        {error ? <p className="py-6 text-center text-sm text-down">{error}</p> : null}

        {!loading && filtered.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((market) => (
              <KalshiMarketCard key={market.id} market={market} />
            ))}
          </div>
        ) : null}

        {!loading && !error && filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No Kalshi markets match your filters.</p>
        ) : null}

        {refreshing && !loading ? (
          <p className="text-center text-[11px] text-faint">Refreshing Kalshi prices…</p>
        ) : null}
      </CardBody>
    </Card>
  );
}
