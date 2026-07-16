/**
 * S&P 500 dynamic binary market specs (Alpaca IEX → LMSR seed).
 * Mirrors backend/services/sp500_market_generator.py for the Vercel single-app path.
 */

import type { Sp500DynamicMarket, StockExpirationType } from "@/lib/types";

const ZERO_DTE_OFFSETS = [0.01, 0.02, 0.03, -0.01] as const;
const WEEKLY_OFFSETS = [0.01, 0.02, 0.05, -0.02] as const;

/** Approximate previous-close seeds when Alpaca credentials are absent. */
export const MOCK_SPOTS: Record<string, number> = {
  AAPL: 228.5,
  MSFT: 425.2,
  NVDA: 118.4,
  AMZN: 198.7,
  GOOGL: 178.3,
  META: 532.1,
  TSLA: 248.6,
  JPM: 212.4,
  V: 312.8,
  UNH: 485.2,
  XOM: 112.6,
  JNJ: 158.3,
  WMT: 98.4,
  MA: 518.7,
  PG: 168.2,
  HD: 385.5,
  BAC: 42.8,
  AMD: 142.3,
  COST: 912.4,
  NFLX: 728.5,
  CRM: 278.2,
  ORCL: 168.9,
  KO: 68.4,
  PEP: 172.1,
  DIS: 112.8,
  CVX: 148.6,
  ABBV: 188.4,
  MRK: 118.7,
  AVGO: 178.5,
  LLY: 812.3,
};

export function nextFriday(onOrAfter: Date): Date {
  const d = new Date(onOrAfter);
  d.setHours(0, 0, 0, 0);
  const delta = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d;
}

export function sessionCloseMs(expiration: Date): number {
  // 16:00 America/New_York ≈ 20:00 UTC (EDT) / 21:00 UTC (EST). Use 20:00 UTC.
  const y = expiration.getFullYear();
  const m = expiration.getMonth();
  const day = expiration.getDate();
  return Date.UTC(y, m, day, 20, 0, 0);
}

export function roundStrike(spot: number, offsetPct: number): number {
  const raw = spot * (1 + offsetPct);
  let step = 5;
  if (spot < 25) step = 0.25;
  else if (spot < 100) step = 0.5;
  else if (spot < 500) step = 1;
  let rounded = Math.round(raw / step) * step;
  rounded = Math.round(rounded * 100) / 100;
  if (Math.abs(rounded - spot) < step * 0.25) {
    rounded = Math.round((spot + (offsetPct >= 0 ? step : -step)) * 100) / 100;
  }
  return Math.max(step, rounded);
}

export function impliedYesPrice(spot: number, strike: number): number {
  if (spot <= 0 || strike <= 0) return 0.5;
  const moneyness = (spot - strike) / spot;
  const score = Math.tanh(moneyness / 0.04);
  return Math.min(0.85, Math.max(0.15, 0.5 + 0.35 * score));
}

function formatStrikeToken(strike: number): string {
  return strike.toFixed(2).replace(/\.?0+$/, "").replace(".", "p");
}

export function buildMarketId(
  ticker: string,
  expirationType: StockExpirationType,
  expirationDate: string,
  strike: number,
): string {
  return `sp500-${ticker.toUpperCase()}-${expirationType}-${expirationDate}-${formatStrikeToken(strike)}`;
}

export function buildQuestion(
  ticker: string,
  strike: number,
  expirationType: StockExpirationType,
): string {
  const strikeLabel = `$${strike.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const symbol = ticker.toUpperCase();
  if (expirationType === "0dte") {
    return `Will ${symbol} close above ${strikeLabel} today?`;
  }
  return `Will ${symbol} close above ${strikeLabel} this Friday?`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayEt(): Date {
  // Approximate ET calendar date via America/New_York offset formatting.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(y, m - 1, day));
}

export interface SpotQuote {
  ticker: string;
  lastPrice: number;
  previousClose?: number | null;
}

export function buildMarketsForTicker(
  ticker: string,
  spot: number,
  previousClose?: number | null,
): Sp500DynamicMarket[] {
  const today = todayEt();
  const friday = nextFriday(today);
  const markets: Sp500DynamicMarket[] = [];
  const seen = new Set<string>();

  const plans: Array<{
    expirationType: StockExpirationType;
    expiration: Date;
    offsets: readonly number[];
  }> = [
    { expirationType: "0dte", expiration: today, offsets: ZERO_DTE_OFFSETS },
    { expirationType: "weekly", expiration: friday, offsets: WEEKLY_OFFSETS },
  ];

  const changePct =
    previousClose && previousClose > 0 ? (spot - previousClose) / previousClose : 0;

  for (const plan of plans) {
    const expIso = isoDate(plan.expiration);
    for (const offset of plan.offsets) {
      const strike = roundStrike(spot, offset);
      const id = buildMarketId(ticker, plan.expirationType, expIso, strike);
      if (seen.has(id)) continue;
      seen.add(id);

      const yesPrice = impliedYesPrice(spot, strike);
      const volumeBase = 40_000 + Math.abs(changePct) * 500_000 + Math.random() * 80_000;

      markets.push({
        id,
        question: buildQuestion(ticker, strike, plan.expirationType),
        category: "stocks",
        status: "open",
        yesPrice,
        change24h: changePct * 0.15,
        volume: Math.round(volumeBase),
        volume24h: Math.round(volumeBase * 0.65),
        openInterest: Math.round(volumeBase * 0.4),
        traders: Math.round(12 + Math.random() * 80),
        closesAt: sessionCloseMs(plan.expiration),
        history: [],
        source: "sp500_dynamic",
        acceptingOrders: true,
        stockTicker: ticker.toUpperCase(),
        strikePrice: strike,
        expirationType: plan.expirationType,
        expirationDate: expIso,
      });
    }
  }

  return markets;
}

export function buildMarketsFromQuotes(quotes: SpotQuote[]): Sp500DynamicMarket[] {
  const markets: Sp500DynamicMarket[] = [];
  for (const quote of quotes) {
    if (!quote.lastPrice || quote.lastPrice <= 0) continue;
    markets.push(
      ...buildMarketsForTicker(quote.ticker, quote.lastPrice, quote.previousClose),
    );
  }
  return markets;
}
