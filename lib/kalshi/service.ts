/** Kalshi market data and integration health (in-process, no Python backend). */

import type { KalshiIntegrationStatus, KalshiMarket } from "@/types";
import {
  fetchKalshiMarket,
  fetchKalshiMarkets,
  getKalshiBaseUrl,
  normalizeKalshiMarket,
  stripKalshiPrefix,
} from "@/lib/kalshi/client";

const CACHE_TTL_MS = Number(process.env.KALSHI_CACHE_TTL_SECONDS ?? 60) * 1000;

interface CacheEntry<T> {
  expires: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();

function readCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.value as T;
}

function writeCache<T>(key: string, value: T): void {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

const hasApiCredentials = Boolean(
  process.env.PP_KALSHI_API_KEY ??
    process.env.KALSHI_API_KEY ??
    process.env.PP_KALSHI_API_SECRET ??
    process.env.KALSHI_API_SECRET,
);

export async function getKalshiIntegrationStatus(): Promise<KalshiIntegrationStatus> {
  const baseUrl = getKalshiBaseUrl();
  const started = Date.now();

  try {
    const { markets } = await fetchKalshiMarkets({ limit: 5 });
    return {
      provider: "kalshi",
      enabled: true,
      healthy: true,
      baseUrl,
      authMode: hasApiCredentials ? "authenticated" : "public",
      hasApiCredentials,
      redis: "unavailable",
      api: "connected",
      marketSampleSize: markets.length,
      latencyMs: Date.now() - started,
      cachedMarketCount: markets.length,
      error: null,
    };
  } catch (error) {
    return {
      provider: "kalshi",
      enabled: true,
      healthy: false,
      baseUrl,
      authMode: hasApiCredentials ? "authenticated" : "public",
      hasApiCredentials,
      redis: "unavailable",
      api: "error",
      marketSampleSize: null,
      latencyMs: Date.now() - started,
      cachedMarketCount: null,
      error: error instanceof Error ? error.message : "Kalshi API unreachable",
    };
  }
}

export async function getActiveKalshiMarkets(refresh = false): Promise<KalshiMarket[]> {
  const cacheKey = "kalshi:active";
  if (!refresh) {
    const cached = readCache<KalshiMarket[]>(cacheKey);
    if (cached) return cached;
  }

  const markets: KalshiMarket[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const page = await fetchKalshiMarkets({ status: "open", limit: 100, cursor: cursor ?? undefined });
    for (const raw of page.markets) {
      try {
        markets.push(normalizeKalshiMarket(raw));
      } catch {
        /* skip malformed */
      }
    }
    cursor = page.cursor;
    pages += 1;
  } while (cursor && pages < 5);

  writeCache(cacheKey, markets);
  return markets;
}

export async function getKalshiMarketById(marketId: string): Promise<KalshiMarket | null> {
  const cacheKey = `kalshi:market:${marketId}`;
  const cached = readCache<KalshiMarket>(cacheKey);
  if (cached) return cached;

  try {
    const raw = await fetchKalshiMarket(stripKalshiPrefix(marketId));
    const market = normalizeKalshiMarket(raw);
    writeCache(cacheKey, market);
    return market;
  } catch {
    return null;
  }
}

export async function searchKalshiMarkets(query: string, refresh = false): Promise<KalshiMarket[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return getActiveKalshiMarkets(refresh);

  const all = await getActiveKalshiMarkets(refresh);
  return all.filter(
    (market) =>
      market.question.toLowerCase().includes(needle) ||
      market.externalTicker?.toLowerCase().includes(needle),
  );
}
