/** Minimal Kalshi Trading API client for public market data (Next.js / Vercel). */

const DEFAULT_BASE_URL =
  process.env.PP_KALSHI_BASE_URL ??
  process.env.KALSHI_BASE_URL ??
  "https://api.elections.kalshi.com/trade-api/v2";

const DAY_MS = 86_400_000;

interface RawKalshiMarket {
  ticker?: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  event_ticker?: string;
  series_ticker?: string;
  close_time?: string;
  status?: string;
  last_price_dollars?: string | number;
  yes_bid_dollars?: string | number;
  yes_ask_dollars?: string | number;
  volume_fp?: string | number;
  volume_24h_fp?: string | number;
  open_interest_fp?: string | number;
  result?: string;
}

function clampPrice(price: number): number {
  return Math.min(0.97, Math.max(0.03, price));
}

function parseDollar(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseIsoMs(value?: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function nowMs(): number {
  return Date.now();
}

function internalMarketId(ticker: string): string {
  return `kalshi-${ticker.toUpperCase()}`;
}

function inferCategory(raw: RawKalshiMarket): import("@/types").MarketCategory {
  const haystack = `${raw.series_ticker ?? ""} ${raw.event_ticker ?? ""} ${raw.title ?? ""}`.toLowerCase();
  if (/\b(btc|bitcoin|eth|ethereum|crypto|solana|xrp)\b/.test(haystack)) return "crypto";
  if (/\b(nvda|aapl|tsla|stock|equity|ipo|s&p|nasdaq)\b/.test(haystack)) return "stocks";
  if (/\b(fed|cpi|inflation|gdp|fomc|rate cut)\b/.test(haystack)) return "economics";
  if (/\b(election|president|senate|congress|vote|politic)\b/.test(haystack)) return "economics";
  if (/\b(nba|nfl|mlb|soccer|sport|game|match|ufc|tennis)\b/.test(haystack)) return "economics";
  if (/\b(weather|temperature|rain|hurricane)\b/.test(haystack)) return "commodities";
  return "economics";
}

function yesPriceFromMarket(raw: RawKalshiMarket): number {
  const last = parseDollar(raw.last_price_dollars);
  if (last !== null && last > 0) return clampPrice(last);

  const yesBid = parseDollar(raw.yes_bid_dollars);
  const yesAsk = parseDollar(raw.yes_ask_dollars);
  if (yesBid !== null && yesAsk !== null && (yesBid > 0 || yesAsk > 0)) {
    if (yesBid > 0 && yesAsk > 0) return clampPrice((yesBid + yesAsk) / 2);
    return clampPrice(yesBid || yesAsk || 0.5);
  }

  return 0.5;
}

function marketStatus(raw: RawKalshiMarket, closesAt: number): import("@/types").Market["status"] {
  const status = String(raw.status ?? "").toLowerCase();
  if (["closed", "settled", "finalized", "determined"].includes(status)) return "resolved";
  const remaining = closesAt - nowMs();
  if (remaining <= 0) return "resolved";
  if (remaining < 14 * DAY_MS) return "closing_soon";
  return "open";
}

export function normalizeKalshiMarket(raw: RawKalshiMarket): import("@/lib/types").KalshiMarket {
  const ticker = String(raw.ticker ?? "").trim();
  if (!ticker) throw new Error("Kalshi market is missing ticker");

  const yesPrice = yesPriceFromMarket(raw);
  const closesAt = parseIsoMs(raw.close_time) ?? nowMs() + 30 * DAY_MS;
  const status = marketStatus(raw, closesAt);
  const now = nowMs();

  return {
    id: internalMarketId(ticker),
    question: String(raw.title ?? "Untitled Kalshi market"),
    category: inferCategory(raw),
    status,
    yesPrice,
    change24h: 0,
    volume: parseDollar(raw.volume_fp) ?? 0,
    volume24h: parseDollar(raw.volume_24h_fp) ?? 0,
    openInterest: parseDollar(raw.open_interest_fp) ?? 0,
    traders: 0,
    closesAt,
    history: [{ t: now, p: yesPrice }],
    source: "kalshi",
    externalTicker: ticker,
    acceptingOrders: status === "open" || status === "closing_soon",
    outcomes: [
      { label: "Yes", price: yesPrice },
      { label: "No", price: clampPrice(1 - yesPrice) },
    ],
    ...(raw.subtitle || raw.yes_sub_title
      ? { subtitle: String(raw.subtitle ?? raw.yes_sub_title) }
      : {}),
    ...(raw.result ? { resolvedOutcome: String(raw.result).toLowerCase() as "yes" | "no" } : {}),
  };
}

export function stripKalshiPrefix(marketId: string): string {
  if (marketId.toLowerCase().startsWith("kalshi-")) {
    return marketId.slice("kalshi-".length);
  }
  return marketId;
}

export function getKalshiBaseUrl(): string {
  return DEFAULT_BASE_URL.replace(/\/$/, "");
}

export async function fetchKalshiMarkets(options: {
  status?: string;
  limit?: number;
  cursor?: string;
} = {}): Promise<{ markets: RawKalshiMarket[]; cursor: string | null }> {
  const params = new URLSearchParams();
  params.set("status", options.status ?? "open");
  params.set("limit", String(options.limit ?? 100));
  if (options.cursor) params.set("cursor", options.cursor);

  const response = await fetch(`${getKalshiBaseUrl()}/markets?${params}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Kalshi API error ${response.status}`);
  }

  const payload = (await response.json()) as { markets?: RawKalshiMarket[]; cursor?: string | null };
  return {
    markets: payload.markets ?? [],
    cursor: payload.cursor ?? null,
  };
}

export async function fetchKalshiMarket(ticker: string): Promise<RawKalshiMarket> {
  const response = await fetch(`${getKalshiBaseUrl()}/markets/${encodeURIComponent(ticker)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Kalshi market not found (${response.status})`);
  }

  const payload = (await response.json()) as { market?: RawKalshiMarket };
  if (!payload.market) throw new Error("Kalshi market payload missing");
  return payload.market;
}
