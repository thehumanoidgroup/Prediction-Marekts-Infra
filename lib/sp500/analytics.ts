/** Aggregate S&P 500 Dynamic market volume by underlying ticker. */

import type { Market } from "@/types";
import { getActiveSp500Markets } from "@/lib/sp500/service";
import { getStore } from "@/lib/store";

export type Sp500TickerStat = {
  ticker: string;
  volume: number;
  volume24h: number;
  markets: number;
  trades: number;
};

function parseTickerFromMarketId(marketId: string): string | null {
  const parts = marketId.split("-");
  if (parts.length < 2 || parts[0].toLowerCase() !== "sp500") return null;
  return parts[1].toUpperCase();
}

/** Rank S&P 500 tickers by traded volume (markets + live journal fills). */
export function getSp500TickerAnalytics(limit = 10): Sp500TickerStat[] {
  const byTicker = new Map<string, Sp500TickerStat>();

  const ensure = (ticker: string): Sp500TickerStat => {
    const key = ticker.toUpperCase();
    let row = byTicker.get(key);
    if (!row) {
      row = { ticker: key, volume: 0, volume24h: 0, markets: 0, trades: 0 };
      byTicker.set(key, row);
    }
    return row;
  };

  let markets: Market[] = [];
  try {
    markets = getActiveSp500Markets(false);
  } catch {
    markets = [];
  }

  for (const market of markets) {
    const ticker = (market.stockTicker || parseTickerFromMarketId(market.id) || "").toUpperCase();
    if (!ticker) continue;
    const row = ensure(ticker);
    row.markets += 1;
    row.volume += market.volume || 0;
    row.volume24h += market.volume24h || market.volume || 0;
  }

  // Count live trades from tenant journals (virtual P&L fills on sp500-* ids).
  const store = getStore();
  for (const tenant of store.tenants.values()) {
    for (const entry of tenant.journal) {
      if (entry.kind !== "trade" || !entry.marketId?.toLowerCase().startsWith("sp500-")) {
        continue;
      }
      const ticker = parseTickerFromMarketId(entry.marketId);
      if (!ticker) continue;
      const row = ensure(ticker);
      const notional = (entry.shares || 0) * (entry.price || 0);
      row.trades += 1;
      row.volume += notional;
      row.volume24h += notional;
    }
  }

  return [...byTicker.values()]
    .sort((a, b) => b.volume - a.volume || b.trades - a.trades)
    .slice(0, limit);
}
