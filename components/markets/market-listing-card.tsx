"use client";

import type { Market, PolymarketMarket, KalshiMarket } from "@/lib/types";
import { MarketCard } from "@/components/markets/market-card";
import { PolymarketMarketCard } from "@/components/markets/polymarket-market-card";
import { KalshiMarketCard } from "@/components/markets/kalshi-market-card";

/** Renders the correct card component based on market source. */
export function MarketListingCard({ market }: { market: Market }) {
  if (market.source === "polymarket") {
    return <PolymarketMarketCard market={market as PolymarketMarket} />;
  }
  if (market.source === "kalshi") {
    return <KalshiMarketCard market={market as KalshiMarket} />;
  }
  return <MarketCard market={market} />;
}
