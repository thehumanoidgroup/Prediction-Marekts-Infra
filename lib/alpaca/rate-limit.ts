/**
 * Lightweight client-side rate budget for Alpaca Market Data REST.
 *
 * Docs:
 * - https://alpaca.markets/docs/
 * - https://alpaca.markets/docs/api-references/market-data-api/
 *
 * Basic / IEX ≈ 200 historical calls/min. We default to 180/min and honor
 * Retry-After on HTTP 429. Polygon.io will replace Alpaca when scaling many accounts.
 */

const GLOBAL_KEY = "__pp_alpaca_rate_limiter__";

interface BucketState {
  timestamps: number[];
  limitPerMinute: number;
}

function getBucket(limitPerMinute: number): BucketState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: BucketState };
  if (!g[GLOBAL_KEY] || g[GLOBAL_KEY]!.limitPerMinute !== limitPerMinute) {
    g[GLOBAL_KEY] = { timestamps: [], limitPerMinute };
  }
  return g[GLOBAL_KEY]!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until a REST slot is available under the per-minute budget. */
export async function acquireAlpacaRateSlot(
  limitPerMinute = Number(process.env.PP_ALPACA_RATE_LIMIT_PER_MINUTE ?? 180),
): Promise<void> {
  const limit = Math.max(10, limitPerMinute);
  const bucket = getBucket(limit);
  const now = Date.now();
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < 60_000);
  if (bucket.timestamps.length >= limit) {
    const waitMs = Math.max(50, 60_000 - (now - bucket.timestamps[0]) + 10);
    await sleep(waitMs);
    return acquireAlpacaRateSlot(limit);
  }
  bucket.timestamps.push(Date.now());
}

export type AlpacaFetchResult = {
  response: Response | null;
  rateLimited: boolean;
  attempts: number;
  error?: string;
};

/** Fetch with rate-slot + 429 Retry-After backoff. */
export async function fetchAlpacaWithRetry(
  url: string,
  init: RequestInit,
  options: { maxRetries?: number; limitPerMinute?: number } = {},
): Promise<AlpacaFetchResult> {
  const maxRetries = options.maxRetries ?? 3;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await acquireAlpacaRateSlot(options.limitPerMinute);
    try {
      const response = await fetch(url, init);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        lastError = `Alpaca rate limit (HTTP 429), attempt ${attempt + 1}`;
        if (attempt < maxRetries) {
          await sleep(Math.max(250, retryAfter * 1000) * (attempt + 1));
          continue;
        }
        return { response, rateLimited: true, attempts: attempt + 1, error: lastError };
      }
      return { response, rateLimited: false, attempts: attempt + 1 };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "fetch failed";
      if (attempt < maxRetries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      return { response: null, rateLimited: false, attempts: attempt + 1, error: lastError };
    }
  }

  return { response: null, rateLimited: false, attempts: maxRetries + 1, error: lastError };
}
