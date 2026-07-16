"use client";

import type { Market, PolymarketMarket, KalshiMarket, Sp500DynamicMarket } from "@/lib/types";
import { MarketCard } from "@/components/markets/market-card";
import { PolymarketMarketCard } from "@/components/markets/polymarket-market-card";
import { KalshiMarketCard } from "@/components/markets/kalshi-market-card";
import { Sp500TickerCard, type Sp500TickerGroup } from "@/components/markets/sp500-market-card";
import { getSp500Sector } from "@/lib/sp500/sectors";

/** Renders the correct card component based on market source. */
export function MarketListingCard({ market }: { market: Market }) {
  if (market.source === "polymarket") {
    return <PolymarketMarketCard market={market as PolymarketMarket} />;
  }
  if (market.source === "kalshi") {
    return <KalshiMarketCard market={market as KalshiMarket} />;
  }
  if (market.source === "sp500_dynamic") {
    const spx = market as Sp500DynamicMarket;
    const group: Sp500TickerGroup = {
      ticker: spx.stockTicker,
      sector: getSp500Sector(spx.stockTicker),
      markets: [spx],
      volume: spx.volume,
    };
    return <Sp500TickerCard group={group} />;
  }
  return <MarketCard market={market} />;
}
