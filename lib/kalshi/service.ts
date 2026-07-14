import type { KalshiIntegrationStatus } from "@/lib/types";
import { getBackendUrl } from "@/lib/backend";

const DEFAULT_BASE_URL =
  process.env.PP_KALSHI_BASE_URL ??
  process.env.KALSHI_BASE_URL ??
  "https://api.elections.kalshi.com/trade-api/v2";

export async function getKalshiIntegrationStatus(): Promise<KalshiIntegrationStatus> {
  const hasApiCredentials = Boolean(
    process.env.PP_KALSHI_API_KEY ??
      process.env.KALSHI_API_KEY ??
      process.env.PP_KALSHI_API_SECRET ??
      process.env.KALSHI_API_SECRET,
  );

  const baseUrl = getBackendUrl();
  if (baseUrl) {
    try {
      const response = await fetch(`${baseUrl}/api/kalshi/status`, { cache: "no-store" });
      if (response.ok) {
        return (await response.json()) as KalshiIntegrationStatus;
      }
    } catch {
      /* fall through to local status */
    }
  }

  return {
    provider: "kalshi",
    enabled: true,
    healthy: false,
    baseUrl: DEFAULT_BASE_URL,
    authMode: hasApiCredentials ? "authenticated" : "public",
    hasApiCredentials,
    redis: "unavailable",
    api: "unknown",
    marketSampleSize: null,
    latencyMs: null,
    cachedMarketCount: null,
    error: baseUrl
      ? null
      : "Kalshi market data requires API_URL / NEXT_PUBLIC_API_URL to the Python backend, or a future in-process Kalshi client.",
  };
}
