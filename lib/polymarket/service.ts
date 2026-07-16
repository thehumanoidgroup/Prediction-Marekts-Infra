/** Polymarket CLOB integration — fetch, normalize, cache (Next.js / Vercel). */

import type { Market, MarketCategory, PolymarketIntegrationStatus } from "@/types";
import { getMockPolymarketMarkets } from "@/lib/polymarket-mock";

const DAY_MS = 86_400_000;
const DEFAULT_HOST = process.env.POLYMARKET_HOST ?? "https://clob.polymarket.com";
const CACHE_TTL_MS = Number(process.env.POLYMARKET_CACHE_TTL_SECONDS ?? 300) * 1000;
const MAX_PAGES = Number(process.env.POLYMARKET_MAX_FETCH_PAGES ?? 2);

const TAG_CATEGORY_MAP: Record<string, MarketCategory> = {
  crypto: "crypto",
  bitcoin: "crypto",
  ethereum: "crypto",
  defi: "crypto",
  stocks: "stocks",
  equities: "stocks",
  forex: "forex",
  fx: "forex",
  commodities: "commodities",
  oil: "commodities",
  gold: "commodities",
  economics: "economics",
  fed: "economics",
  inflation: "economics",
  macro: "economics",
  politics: "economics",
  elections: "economics",
  indices: "indices",
  "s&p": "indices",
  nasdaq: "indices",
};

const KEYWORD_PATTERNS: Array<[RegExp, MarketCategory]> = [
  [/\b(btc|bitcoin|eth|ethereum|crypto|solana|defi)\b/i, "crypto"],
  [/\b(nvda|aapl|tsla|stock|equity|ipo)\b/i, "stocks"],
  [/\b(eur\/usd|usd\/jpy|forex|fx)\b/i, "forex"],
  [/\b(oil|wti|gold|crude|commodity)\b/i, "commodities"],
  [/\b(s&p|nasdaq|dow|vix|index)\b/i, "indices"],
  [/\b(fed|cpi|inflation|unemployment|gdp|fomc)\b/i, "economics"],
];

interface RawMarket {
  condition_id?: string;
  conditionId?: string;
  question?: string;
  description?: string;
  market_slug?: string;
  end_date_iso?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  accepting_orders?: boolean;
  tags?: string[];
  volume?: number | string;
  volume_num?: number | string;
  volume_24hr?: number | string;
  liquidity?: number | string;
  tokens?: Array<{
    token_id?: string;
    outcome?: string;
    price?: number;
    winner?: boolean;
  }>;
}

interface CacheEntry<T> {
  expires: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

function nowMs(): number {
  return Date.now();
}

function clampPrice(price: number): number {
  return Math.min(0.97, Math.max(0.03, price));
}

function parseIsoMs(value?: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function inferCategory(raw: RawMarket): MarketCategory {
  const tags = (raw.tags ?? []).map((t) => String(t).toLowerCase());
  for (const tag of tags) {
    if (TAG_CATEGORY_MAP[tag]) return TAG_CATEGORY_MAP[tag];
    for (const [key, category] of Object.entries(TAG_CATEGORY_MAP)) {
      if (tag.includes(key)) return category;
    }
  }
  const haystack = [raw.question, raw.description, raw.market_slug, tags.join(" ")]
    .filter(Boolean)
    .join(" ");
  for (const [pattern, category] of KEYWORD_PATTERNS) {
    if (pattern.test(haystack)) return category;
  }
  return "economics";
}

function marketStatus(raw: RawMarket, closesAt: number): Market["status"] {
  if (raw.closed || raw.archived || raw.active === false) return "resolved";
  const remaining = closesAt - nowMs();
  if (remaining <= 0) return "resolved";
  if (remaining < 14 * DAY_MS) return "closing_soon";
  return "open";
}

function yesPriceFromTokens(tokens: RawMarket["tokens"]): number {
  if (!tokens?.length) return 0.5;
  const yes = tokens.find((t) => /^(yes|y)$/i.test(String(t.outcome ?? "")));
  if (yes) return clampPrice(Number(yes.price ?? 0.5));
  const nonNo = tokens.find((t) => !/^(no|n)$/i.test(String(t.outcome ?? "")));
  if (nonNo) return clampPrice(Number(nonNo.price ?? 0.5));
  return clampPrice(Number(tokens[0].price ?? 0.5));
}

function resolvedOutcome(tokens: RawMarket["tokens"]): "yes" | "no" | undefined {
  const winner = tokens?.find((t) => t.winner);
  if (!winner) return undefined;
  const outcome = String(winner.outcome ?? "").toLowerCase();
  if (/^(yes|y)$/.test(outcome)) return "yes";
  if (/^(no|n)$/.test(outcome)) return "no";
  return undefined;
}

export function normalizePolymarketMarket(raw: RawMarket): Market {
  const conditionId = String(raw.condition_id ?? raw.conditionId ?? "").trim();
  if (!conditionId) {
    throw new Error("Polymarket market is missing condition_id.");
  }

  const tokens = raw.tokens ?? [];
  const yesPrice = yesPriceFromTokens(tokens);
  const closesAt = parseIsoMs(raw.end_date_iso) ?? nowMs() + 30 * DAY_MS;
  const status = marketStatus(raw, closesAt);
  const now = nowMs();

  const volume = Number(raw.volume_num ?? raw.volume ?? 0) || 0;
  const volume24h = Number(raw.volume_24hr ?? volume) || 0;
  const openInterest = Number(raw.liquidity ?? 0) || 0;

  const market: Market = {
    id: `poly-${conditionId.toLowerCase()}`,
    question: String(raw.question ?? "Untitled Polymarket market"),
    category: inferCategory(raw),
    status,
    yesPrice,
    change24h: 0,
    volume,
    volume24h,
    openInterest,
    traders: 0,
    closesAt,
    history: [{ t: now, p: yesPrice }],
    source: "polymarket",
    externalConditionId: conditionId,
    marketSlug: raw.market_slug,
    acceptingOrders: Boolean(raw.accepting_orders),
    outcomes: tokens.map((token) => ({
      tokenId: token.token_id,
      label: token.outcome,
      price: Number(token.price ?? 0),
      winner: Boolean(token.winner),
    })),
  };

  const resolved = resolvedOutcome(tokens);
  if (resolved) market.resolvedOutcome = resolved;

  return market;
}

async function fetchMarketsPage(cursor = ""): Promise<{
  data: RawMarket[];
  next_cursor: string;
}> {
  // `/sampling-markets` returns currently tradeable markets. Plain `/markets`
  // is heavily historical/closed and yields empty "active" filters on Vercel.
  const url = new URL(`${DEFAULT_HOST.replace(/\/$/, "")}/sampling-markets`);
  if (cursor) url.searchParams.set("next_cursor", cursor);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Polymarket CLOB error ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: RawMarket[];
    next_cursor?: string;
  };

  return {
    data: payload.data ?? [],
    next_cursor: payload.next_cursor ?? "LTE=",
  };
}

async function fetchAllRawMarkets(): Promise<RawMarket[]> {
  const markets: RawMarket[] = [];
  let cursor = "";
  let pages = 0;

  while (pages < MAX_PAGES) {
    const page = await fetchMarketsPage(cursor);
    markets.push(...page.data);
    pages += 1;
    if (!page.next_cursor || page.next_cursor === "LTE=") break;
    cursor = page.next_cursor;
  }

  return markets;
}

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs = CACHE_TTL_MS): void {
  cache.set(key, { expires: Date.now() + ttlMs, value });
}

const CACHE_ALL = "pp:polymarket:markets:all";

export async function getAllPolymarketMarkets(refresh = false): Promise<Market[]> {
  if (!refresh) {
    const cached = cacheGet<Market[]>(CACHE_ALL);
    if (cached) return cached;
  }

  try {
    const raw = await fetchAllRawMarkets();
    const normalized: Market[] = [];
    for (const market of raw) {
      try {
        normalized.push(normalizePolymarketMarket(market));
      } catch {
        /* skip malformed CLOB rows */
      }
    }
    if (normalized.length === 0) {
      return getMockPolymarketMarkets({ active: false });
    }
    cacheSet(CACHE_ALL, normalized);
    return normalized;
  } catch {
    return getMockPolymarketMarkets({ active: false });
  }
}

export async function getActivePolymarketMarkets(refresh = false): Promise<Market[]> {
  const all = await getAllPolymarketMarkets(refresh);
  return all.filter(
    (market) =>
      market.acceptingOrders && (market.status === "open" || market.status === "closing_soon"),
  );
}

export async function getPolymarketMarketById(marketId: string): Promise<Market | null> {
  const key = marketId.startsWith("poly-") ? marketId.slice(5) : marketId;
  const all = await getAllPolymarketMarkets();
  const fromList = all.find(
    (m) => m.id === marketId || m.externalConditionId === key,
  );
  if (fromList) return fromList;

  try {
    const response = await fetch(`${DEFAULT_HOST.replace(/\/$/, "")}/markets/${encodeURIComponent(key)}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!response.ok) return null;
    const raw = (await response.json()) as RawMarket;
    return normalizePolymarketMarket(raw);
  } catch {
    return null;
  }
}

export async function searchPolymarketMarkets(query: string, refresh = false): Promise<Market[]> {
  const needle = query.trim().toLowerCase();
  const markets = await getAllPolymarketMarkets(refresh);
  if (!needle) return markets;

  return markets.filter((market) => {
    const fields = [
      market.question,
      market.marketSlug ?? "",
      market.category,
      market.id,
      market.externalConditionId ?? "",
      ...(market.outcomes?.map((o) => o.label ?? "") ?? []),
    ];
    return fields.some((value) => String(value).toLowerCase().includes(needle));
  });
}

export async function getPolymarketIntegrationStatus(): Promise<PolymarketIntegrationStatus> {
  const started = Date.now();
  const hasApiCreds = Boolean(
    process.env.POLYMARKET_API_KEY &&
      process.env.POLYMARKET_API_SECRET &&
      process.env.POLYMARKET_API_PASSPHRASE,
  );
  const hasWallet = Boolean(process.env.POLYMARKET_PRIVATE_KEY);

  const status: PolymarketIntegrationStatus = {
    provider: "polymarket",
    enabled: true,
    host: DEFAULT_HOST,
    chainId: Number(process.env.POLYMARKET_CHAIN_ID ?? 137),
    authLevel: hasApiCreds ? 2 : hasWallet ? 1 : 0,
    authMode: hasApiCreds ? "trading" : hasWallet ? "wallet" : "public",
    hasWallet,
    hasApiCredentials: hasApiCreds,
    canTrade: hasApiCreds && hasWallet,
    redis: "unavailable",
    clob: "unknown",
    marketSampleSize: null,
    latencyMs: null,
    cachedMarketCount: cacheGet<Market[]>(CACHE_ALL)?.length ?? null,
    error: null,
    healthy: false,
  };

  try {
    const page = await fetchMarketsPage();
    status.clob = "connected";
    status.marketSampleSize = page.data.length;
    status.latencyMs = Date.now() - started;
    status.healthy = true;
  } catch (error) {
    status.clob = "error";
    status.error = error instanceof Error ? error.message : "Polymarket unreachable";
    status.latencyMs = Date.now() - started;
  }

  return status;
}
