import { NextResponse } from "next/server";
import { fetchBackendPolymarketStatus } from "@/lib/api-server";
import type { PolymarketIntegrationStatus } from "@/lib/types";

const MOCK_STATUS: PolymarketIntegrationStatus = {
  provider: "polymarket",
  enabled: true,
  healthy: false,
  host: "https://clob.polymarket.com",
  chainId: 137,
  authLevel: 0,
  authMode: "public",
  hasWallet: false,
  hasApiCredentials: false,
  canTrade: false,
  redis: "unavailable",
  clob: "unknown",
  marketSampleSize: null,
  latencyMs: null,
  cachedMarketCount: null,
  error: "Backend API not configured — set NEXT_PUBLIC_API_URL",
};

export async function GET() {
  const remote = await fetchBackendPolymarketStatus();
  return NextResponse.json(remote ?? MOCK_STATUS);
}
