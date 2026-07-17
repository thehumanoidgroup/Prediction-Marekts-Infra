import type { EnrichedPosition } from "@/lib/services";
import type { Market, MarketSourceType, StockExpirationType } from "@/lib/types";

export type PositionTenorFilter = "all" | "0dte" | "weekly";
export type PositionProviderFilter = MarketSourceType | "all";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Infer 0DTE vs weekly when the market has no explicit expirationType. */
export function resolveExpirationType(
  market: Pick<Market, "expirationType" | "closesAt">,
  now = Date.now(),
): StockExpirationType | null {
  if (market.expirationType === "0dte" || market.expirationType === "weekly") {
    return market.expirationType;
  }
  const msLeft = market.closesAt - now;
  if (msLeft < 0) return null;
  if (msLeft <= DAY_MS) return "0dte";
  if (msLeft <= WEEK_MS) return "weekly";
  return null;
}

export function filterOpenPositions(
  positions: EnrichedPosition[],
  opts: {
    tenor?: PositionTenorFilter;
    provider?: PositionProviderFilter;
  } = {},
): EnrichedPosition[] {
  const tenor = opts.tenor ?? "all";
  const provider = opts.provider ?? "all";

  return positions.filter((position) => {
    if (provider !== "all" && position.market.source !== provider) return false;
    if (tenor === "all") return true;
    return resolveExpirationType(position.market) === tenor;
  });
}

export function markPosition(
  position: EnrichedPosition,
  liveYesPrices: Record<string, number>,
): {
  yesPrice: number;
  currentPrice: number;
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
} {
  const yesPrice = liveYesPrices[position.marketId] ?? position.market.yesPrice;
  const currentPrice = position.outcome === "yes" ? yesPrice : 1 - yesPrice;
  const value = currentPrice * position.shares;
  const cost = position.avgPrice * position.shares;
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { yesPrice, currentPrice, value, cost, pnl, pnlPct };
}

export function summarizeLivePositions(
  positions: EnrichedPosition[],
  liveYesPrices: Record<string, number>,
): { portfolioValue: number; openPnl: number; costBasis: number } {
  let portfolioValue = 0;
  let openPnl = 0;
  let costBasis = 0;
  for (const position of positions) {
    const marked = markPosition(position, liveYesPrices);
    portfolioValue += marked.value;
    openPnl += marked.pnl;
    costBasis += marked.cost;
  }
  return { portfolioValue, openPnl, costBasis };
}

export function formatStrikeOutcome(position: EnrichedPosition): string {
  const { market, outcome } = position;
  const side = outcome.toUpperCase();
  if (typeof market.strikePrice === "number" && Number.isFinite(market.strikePrice)) {
    const ticker = market.stockTicker ? `${market.stockTicker} ` : "";
    return `${ticker}${side} ≥ $${market.strikePrice.toFixed(2)}`;
  }
  return side;
}

export function marketStatusLabel(status: Market["status"]): string {
  switch (status) {
    case "open":
      return "Open";
    case "closing_soon":
      return "Closing soon";
    case "resolved":
      return "Resolved";
    default:
      return status;
  }
}
