/**
 * In-memory sliding-window rate limiter for the provisioning webhook.
 *
 * Suitable for serverless (per-instance). For multi-region production,
 * back with Redis or an edge rate limiter.
 */

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __provisioningRateLimitStore: Map<string, RateLimitBucket> | undefined;
}

function getStore(): Map<string, RateLimitBucket> {
  if (!globalThis.__provisioningRateLimitStore) {
    globalThis.__provisioningRateLimitStore = new Map();
  }
  return globalThis.__provisioningRateLimitStore;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs?: number;
}

export function getWebhookRateLimitConfig(): RateLimitConfig {
  const maxRequests = Number(process.env.PROVISIONING_WEBHOOK_RATE_LIMIT ?? 60);
  const windowMs = Number(process.env.PROVISIONING_WEBHOOK_RATE_WINDOW_MS ?? 60_000);
  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : 60,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000,
  };
}

export function checkRateLimit(key: string, config = getWebhookRateLimitConfig()): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now - bucket.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
    };
  }

  if (bucket.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - bucket.windowStart);
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 1),
    };
  }

  bucket.count += 1;
  store.set(key, bucket);

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - bucket.count,
  };
}

export function buildWebhookRateLimitKey(input: {
  propFirmId: string;
  ipAddress?: string | null;
  apiKeyPrefix?: string;
}): string {
  const ip = input.ipAddress ?? "unknown";
  const keyPart = input.apiKeyPrefix ?? "no-key";
  return `${input.propFirmId}:${keyPart}:${ip}`;
}

/** @internal Test helper */
export function resetRateLimitStore(): void {
  globalThis.__provisioningRateLimitStore = new Map();
}
