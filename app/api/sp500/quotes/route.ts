/**
 * Fetch latest Alpaca IEX quotes for viewed S&P 500 tickers.
 *
 * Used by the trader dashboard when a long-lived Python WebSocket bridge is
 * unavailable (Vercel single-app). Only requested tickers are priced.
 *
 * Official docs:
 * - https://alpaca.markets/docs/
 * - https://alpaca.markets/docs/api-references/market-data-api/
 *
 * Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
 * Polygon.io will replace Alpaca when scaling many accounts.
 */

import { NextResponse } from "next/server";
import { fetchAlpacaWithRetry } from "@/lib/alpaca/rate-limit";
import { sessionPhase } from "@/lib/sp500/market-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALPACA_DATA_BASE =
  process.env.ALPACA_DATA_BASE_URL ??
  process.env.PP_ALPACA_DATA_BASE_URL ??
  "https://data.alpaca.markets/v2";

const FEED = process.env.ALPACA_FEED ?? process.env.PP_ALPACA_FEED ?? "iex";

type QuoteRow = {
  ticker: string;
  lastPrice: number;
  previousClose?: number | null;
  bid?: number | null;
  ask?: number | null;
  session?: string;
  stale?: boolean;
  thin?: boolean;
};

function parseTickers(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const symbol = part.trim().toUpperCase();
    if (symbol && !seen.has(symbol)) seen.add(symbol);
  }
  // Free-tier WS cap is 30 — keep REST batch in the same envelope.
  return [...seen].slice(0, 30);
}

function priceFromSnapshot(snapshot: Record<string, unknown>): QuoteRow | null {
  const latestTrade = (snapshot.latestTrade ?? snapshot.latest_trade ?? {}) as Record<
    string,
    unknown
  >;
  const daily = (snapshot.dailyBar ?? snapshot.daily_bar ?? {}) as Record<string, unknown>;
  const minute = (snapshot.minuteBar ?? snapshot.minute_bar ?? {}) as Record<string, unknown>;
  const prev = (snapshot.prevDailyBar ?? snapshot.prev_daily_bar ?? {}) as Record<string, unknown>;
  const quote = (snapshot.latestQuote ?? snapshot.latest_quote ?? {}) as Record<string, unknown>;

  const hasTrade = typeof latestTrade.p === "number";
  const hasDaily = typeof daily.c === "number";
  let last =
    hasTrade
      ? (latestTrade.p as number)
      : hasDaily
        ? (daily.c as number)
        : typeof minute.c === "number"
          ? minute.c
          : null;
  const previousClose = typeof prev.c === "number" ? Number(prev.c) : null;
  const previousCloseOnly = last == null && previousClose != null;
  if (previousCloseOnly) last = previousClose;
  if (last == null) return null;

  const phase = sessionPhase();
  const thin = previousCloseOnly || (!hasTrade && phase === "regular");
  const stale = previousCloseOnly || phase !== "regular";

  return {
    ticker: String(snapshot.symbol ?? ""),
    lastPrice: Number(last),
    previousClose,
    bid: typeof quote.bp === "number" ? Number(quote.bp) : null,
    ask: typeof quote.ap === "number" ? Number(quote.ap) : null,
    session: phase,
    stale,
    thin,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickers = parseTickers(searchParams.get("tickers"));
  if (tickers.length === 0) {
    return NextResponse.json({
      quotes: {},
      provider: "alpaca",
      feed: FEED,
      session: sessionPhase(),
    });
  }

  const apiKey = process.env.ALPACA_API_KEY ?? process.env.PP_ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY ?? process.env.PP_ALPACA_SECRET_KEY;
  if (!apiKey || !secret) {
    return NextResponse.json(
      {
        quotes: {},
        provider: "alpaca",
        feed: FEED,
        session: sessionPhase(),
        error: "Alpaca credentials not configured",
      },
      { status: 200 },
    );
  }

  const url = new URL(`${ALPACA_DATA_BASE}/stocks/snapshots`);
  url.searchParams.set("symbols", tickers.join(","));
  url.searchParams.set("feed", FEED);

  const { response, rateLimited, attempts, error } = await fetchAlpacaWithRetry(
    url.toString(),
    {
      headers: {
        "APCA-API-KEY-ID": apiKey,
        "APCA-API-SECRET-KEY": secret,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response) {
    return NextResponse.json(
      {
        quotes: {},
        provider: "alpaca",
        feed: FEED,
        session: sessionPhase(),
        rateLimited: false,
        attempts,
        error: error ?? "quote fetch failed",
      },
      { status: 200 },
    );
  }

  if (rateLimited || response.status === 429) {
    return NextResponse.json(
      {
        quotes: {},
        provider: "alpaca",
        feed: FEED,
        session: sessionPhase(),
        rateLimited: true,
        attempts,
        error:
          error ??
          "Alpaca rate limit exceeded — serving last cached client quotes. Polygon.io will replace Alpaca when scaling many accounts.",
      },
      { status: 200 },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      {
        quotes: {},
        provider: "alpaca",
        feed: FEED,
        session: sessionPhase(),
        attempts,
        error: `Alpaca ${response.status}: ${text.slice(0, 200)}`,
      },
      { status: 200 },
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const nested = payload.snapshots;
  const source =
    nested && typeof nested === "object"
      ? (nested as Record<string, unknown>)
      : payload;

  const quotes: Record<string, QuoteRow> = {};
  for (const ticker of tickers) {
    const raw = source[ticker];
    if (!raw || typeof raw !== "object") continue;
    const row = priceFromSnapshot({ ...(raw as object), symbol: ticker });
    if (row) quotes[ticker] = row;
  }

  return NextResponse.json({
    quotes,
    provider: "alpaca",
    feed: FEED,
    session: sessionPhase(),
    attempts,
    // Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
    transport: "rest",
  });
}
