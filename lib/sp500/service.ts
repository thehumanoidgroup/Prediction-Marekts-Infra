/** S&P 500 dynamic markets for the Vercel single-app path (Alpaca IEX + mock fallback). */

import type { Sp500DynamicMarket } from "@/lib/types";
import {
  MOCK_SPOTS,
  buildMarketsFromQuotes,
  type SpotQuote,
} from "@/lib/sp500/generator";
import { SP500_DASHBOARD_TICKERS } from "@/lib/sp500/sectors";

const CACHE_TTL_MS = Number(process.env.SP500_MARKETS_CACHE_TTL_SECONDS ?? 45) * 1000;

const ALPACA_DATA_BASE =
  process.env.ALPACA_DATA_BASE_URL ??
  process.env.PP_ALPACA_DATA_BASE_URL ??
  "https://data.alpaca.markets/v2";

const FEED = process.env.ALPACA_FEED ?? process.env.PP_ALPACA_FEED ?? "iex";

interface CacheEntry {
  expires: number;
  markets: Sp500DynamicMarket[];
}

let cache: CacheEntry | null = null;

function mockQuotes(tickers: string[]): SpotQuote[] {
  return tickers.map((ticker) => {
    const base = MOCK_SPOTS[ticker] ?? 100;
    // Tiny deterministic jitter so cards look alive across refreshes.
    const jitter = ((ticker.charCodeAt(0) + ticker.length) % 7) * 0.05;
    return {
      ticker,
      lastPrice: Math.round(base * (1 + jitter / 100) * 100) / 100,
      previousClose: base,
    };
  });
}

async function fetchAlpacaQuotes(tickers: string[]): Promise<SpotQuote[] | null> {
  const apiKey = process.env.ALPACA_API_KEY ?? process.env.PP_ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY ?? process.env.PP_ALPACA_SECRET_KEY;
  if (!apiKey || !secret || tickers.length === 0) return null;

  try {
    const url = new URL(`${ALPACA_DATA_BASE}/stocks/snapshots`);
    url.searchParams.set("symbols", tickers.join(","));
    url.searchParams.set("feed", FEED);

    const response = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": secret,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, unknown>;
    const nested = payload.snapshots;
    const source =
      nested && typeof nested === "object"
        ? (nested as Record<string, unknown>)
        : payload;

    const quotes: SpotQuote[] = [];
    for (const ticker of tickers) {
      const raw = source[ticker];
      if (!raw || typeof raw !== "object") continue;
      const snap = raw as Record<string, unknown>;
      const latestTrade = (snap.latestTrade ?? snap.latest_trade ?? {}) as Record<
        string,
        unknown
      >;
      const daily = (snap.dailyBar ?? snap.daily_bar ?? {}) as Record<string, unknown>;
      const prev = (snap.prevDailyBar ?? snap.prev_daily_bar ?? {}) as Record<
        string,
        unknown
      >;
      let last =
        typeof latestTrade.p === "number"
          ? latestTrade.p
          : typeof daily.c === "number"
            ? daily.c
            : null;
      const previousClose = typeof prev.c === "number" ? prev.c : null;
      if (last == null && previousClose != null) last = previousClose;
      if (last == null) continue;
      quotes.push({ ticker, lastPrice: last, previousClose });
    }
    return quotes.length > 0 ? quotes : null;
  } catch {
    return null;
  }
}

export async function getActiveSp500Markets(refresh = false): Promise<Sp500DynamicMarket[]> {
  if (!refresh && cache && cache.expires > Date.now()) {
    return cache.markets;
  }

  const tickers = [...SP500_DASHBOARD_TICKERS];
  const live = await fetchAlpacaQuotes(tickers);
  const quotes = live ?? mockQuotes(tickers);
  const markets = buildMarketsFromQuotes(quotes).sort(
    (a, b) => (b.volume24h || b.volume) - (a.volume24h || a.volume),
  );

  cache = { expires: Date.now() + CACHE_TTL_MS, markets };
  return markets;
}

export async function getSp500MarketById(marketId: string): Promise<Sp500DynamicMarket | null> {
  const markets = await getActiveSp500Markets();
  const found = markets.find((m) => m.id === marketId);
  if (found) return found;

  // Parse deterministic ids: sp500-{TICKER}-{0dte|weekly}-{YYYY-MM-DD}-{strike}
  const match = /^sp500-([A-Z.]+)-(0dte|weekly)-(\d{4}-\d{2}-\d{2})-(.+)$/i.exec(
    marketId,
  );
  if (!match) return null;

  const ticker = match[1].toUpperCase();
  const quotes = (await fetchAlpacaQuotes([ticker])) ?? mockQuotes([ticker]);
  const generated = buildMarketsFromQuotes(quotes);
  return generated.find((m) => m.id === marketId) ?? null;
}

export async function searchSp500Markets(
  query: string,
  refresh = false,
): Promise<Sp500DynamicMarket[]> {
  const needle = query.trim().toLowerCase();
  const markets = await getActiveSp500Markets(refresh);
  if (!needle) return markets;
  return markets.filter(
    (m) =>
      m.stockTicker.toLowerCase().includes(needle) ||
      m.question.toLowerCase().includes(needle),
  );
}
