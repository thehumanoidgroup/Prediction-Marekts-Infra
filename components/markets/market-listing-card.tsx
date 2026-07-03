"use client";

import type { Market, PolymarketMarket } from "@/lib/types";
import { MarketCard } from "@/components/markets/market-card";
import { PolymarketMarketCard } from "@/components/markets/polymarket-market-card";

/** Renders the correct card component based on market source. */
export function MarketListingCard({ market }: { market: Market }) {
  if (market.source === "polymarket") {
    return <PolymarketMarketCard market={market as PolymarketMarket} />;
  }
  return <MarketCard market={market} />;
}
