"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Sp500DynamicMarket, StockExpirationType } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  Sp500TickerCard,
  type Sp500TickerGroup,
} from "@/components/markets/sp500-market-card";
import {
  SP500_SECTORS,
  getSp500Sector,
  type Sp500Sector,
} from "@/lib/sp500/sectors";
import { cn } from "@/lib/utils";

type ExpTab = StockExpirationType;

const EXP_TABS: { id: ExpTab; label: string }[] = [
  { id: "0dte", label: "0DTE" },
  { id: "weekly", label: "Weekly" },
];

function groupByTicker(markets: Sp500DynamicMarket[]): Sp500TickerGroup[] {
  const map = new Map<string, Sp500TickerGroup>();
  for (const market of markets) {
    const ticker = market.stockTicker.toUpperCase();
    let group = map.get(ticker);
    if (!group) {
      group = {
        ticker,
        sector: getSp500Sector(ticker),
        markets: [],
        volume: 0,
      };
      map.set(ticker, group);
    }
    group.markets.push(market);
    group.volume += market.volume24h || market.volume || 0;
  }
  return [...map.values()].sort((a, b) => b.volume - a.volume);
}

/** S&P 500 markets feed — fortraders-style 0DTE / Weekly ticker cards. */
export function Sp500MarketsSection() {
  const [markets, setMarkets] = useState<Sp500DynamicMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expTab, setExpTab] = useState<ExpTab>("0dte");
  const [sector, setSector] = useState<Sp500Sector | "all">("all");
  const [tickerQuery, setTickerQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ source: "sp500_dynamic", sort: "volume" });
      const response = await fetch(`/api/markets?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load S&P 500 markets");
      const data = await response.json();
      setMarkets((data.markets ?? []) as Sp500DynamicMarket[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filteredGroups = useMemo(() => {
    const needle = tickerQuery.trim().toUpperCase();
    let rows = markets.filter((m) => m.expirationType === expTab);
    if (sector !== "all") {
      rows = rows.filter((m) => getSp500Sector(m.stockTicker) === sector);
    }
    if (needle) {
      rows = rows.filter(
        (m) =>
          m.stockTicker.toUpperCase().includes(needle) ||
          m.question.toUpperCase().includes(needle),
      );
    }
    return groupByTicker(rows).slice(0, 9);
  }, [markets, expTab, sector, tickerQuery]);

  return (
    <Card>
      <CardHeader
        title="S&P 500 Markets"
        subtitle="Dynamic stock strikes · Alpaca live · virtual P&L only"
        action={
          <Link
            href="/markets?source=sp500_dynamic"
            className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
          >
            View all
          </Link>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {EXP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setExpTab(tab.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                expTab === tab.id
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-edge bg-surface-2 text-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSector("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                sector === "all" ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              All sectors
            </button>
            {SP500_SECTORS.filter((s) => s !== "Other").map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSector(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  sector === s ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={tickerQuery}
            onChange={(e) => setTickerQuery(e.target.value)}
            placeholder="Filter ticker…"
            aria-label="Filter by ticker"
            className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs text-foreground placeholder:text-faint focus:border-accent/50 focus:outline-none sm:w-40"
          />
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-card border border-edge bg-surface-2" />
            ))}
          </div>
        ) : null}

        {error ? <p className="py-6 text-center text-sm text-down">{error}</p> : null}

        {!loading && filteredGroups.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredGroups.map((group) => (
              <Sp500TickerCard key={group.ticker} group={group} />
            ))}
          </div>
        ) : null}

        {!loading && !error && filteredGroups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No S&P 500 markets match your filters.
          </p>
        ) : null}

        {refreshing && !loading ? (
          <p className="text-center text-[11px] text-faint">Refreshing S&P 500 prices…</p>
        ) : null}
      </CardBody>
    </Card>
  );
}
