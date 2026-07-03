"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  MarketSourceToggle,
  type MarketSource,
} from "@/components/markets/market-source-toggle";
import { PolymarketMarketCard } from "@/components/markets/polymarket-market-card";
import { MarketCard } from "@/components/markets/market-card";
import type { Market, PolymarketMarket } from "@/lib/types";
import { usePolymarketMarkets } from "@/lib/hooks/use-polymarket-markets";
import { cn } from "@/lib/utils";

function DashboardMarketsSectionBody({
  internalMarkets,
}: {
  internalMarkets: Market[];
}) {
  const [source, setSource] = useState<MarketSource>("internal");
  const polymarket = usePolymarketMarkets({}, { enabled: source === "polymarket", limit: 6 });

  const markets =
    source === "polymarket"
      ? polymarket.markets.status === "success"
        ? polymarket.markets.data
        : []
      : internalMarkets.slice(0, 6);

  return (
    <Card>
      <CardHeader
        title={source === "polymarket" ? "Polymarket Markets" : "Internal Markets"}
        subtitle={
          source === "polymarket"
            ? "Live odds from Polymarket CLOB"
            : "PropPredict LMSR simulation markets"
        }
        action={
          <Link
            href={source === "polymarket" ? "/markets?source=polymarket" : "/markets"}
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

        {source === "polymarket" && polymarket.markets.status === "loading" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className={cn("h-56 animate-pulse rounded-card border border-edge bg-surface-2")}
              />
            ))}
          </div>
        ) : null}

        {source === "polymarket" && polymarket.markets.status === "error" ? (
          <p className="py-6 text-center text-sm text-down">{polymarket.markets.error}</p>
        ) : null}

        {markets.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {source === "polymarket"
              ? markets.map((market) => (
                  <PolymarketMarketCard key={market.id} market={market as PolymarketMarket} />
                ))
              : markets.map((market) => <MarketCard key={market.id} market={market} />)}
          </div>
        ) : source !== "polymarket" || polymarket.markets.status === "success" ? (
          <p className="py-6 text-center text-sm text-muted">No markets to show.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function DashboardMarketsSection({ internalMarkets }: { internalMarkets: Market[] }) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-card border border-edge bg-surface" />}>
      <DashboardMarketsSectionBody internalMarkets={internalMarkets} />
    </Suspense>
  );
}
