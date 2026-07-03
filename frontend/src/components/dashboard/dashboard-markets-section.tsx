"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  MarketSourceToggle,
} from "@/components/markets/market-source-toggle";
import { MarketListingCard } from "@/components/markets/market-listing-card";
import { useHybridMarkets } from "@/lib/hooks/use-hybrid-markets";
import type { MarketViewSource } from "@/lib/types";
import { cn } from "@/lib/utils";

function sectionTitle(source: MarketViewSource): string {
  switch (source) {
    case "internal":
      return "Internal Markets";
    case "polymarket":
      return "Polymarket Markets";
    default:
      return "Hybrid Markets";
  }
}

function sectionSubtitle(source: MarketViewSource): string {
  switch (source) {
    case "internal":
      return "PropPredict LMSR simulation markets";
    case "polymarket":
      return "Live odds from Polymarket CLOB";
    default:
      return "Internal LMSR + live Polymarket listings";
  }
}

function DashboardMarketsSectionBody() {
  const [source, setSource] = useState<MarketViewSource>("all");
  const { payload, refreshing } = useHybridMarkets({ source }, { limit: 6 });

  const markets = payload.status === "success" ? payload.data.markets : [];
  const counts = payload.status === "success" ? payload.data.counts : null;
  const isLoading = payload.status === "loading";
  const isError = payload.status === "error";

  const viewAllHref =
    source === "polymarket"
      ? "/markets?source=polymarket"
      : source === "internal"
        ? "/markets?source=internal"
        : "/markets";

  return (
    <Card>
      <CardHeader
        title={sectionTitle(source)}
        subtitle={
          counts && source === "all"
            ? `${sectionSubtitle(source)} · ${counts.internal} LMSR · ${counts.polymarket} Polymarket`
            : sectionSubtitle(source)
        }
        action={
          <Link
            href={viewAllHref}
            className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
          >
            View all
          </Link>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <MarketSourceToggle
          className="w-full sm:w-auto"
          value={source}
          onChange={setSource}
        />

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className={cn("h-56 animate-pulse rounded-card border border-edge bg-surface-2")}
              />
            ))}
          </div>
        ) : null}

        {isError ? (
          <p className="py-6 text-center text-sm text-down">{payload.error}</p>
        ) : null}

        {!isLoading && markets.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {markets.map((market) => (
              <MarketListingCard key={market.id} market={market} />
            ))}
          </div>
        ) : null}

        {!isLoading && !isError && markets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No markets to show.</p>
        ) : null}

        {refreshing ? (
          <p className="text-center text-[11px] text-faint">Refreshing market feed…</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function DashboardMarketsSection() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-card border border-edge bg-surface" />}>
      <DashboardMarketsSectionBody />
    </Suspense>
  );
}
