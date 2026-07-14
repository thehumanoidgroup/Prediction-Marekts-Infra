import { KalshiIntegrationCard } from "@/components/platform/kalshi-integration-card";
import { PolymarketIntegrationCard } from "@/components/platform/polymarket-integration-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { fetchBackendKalshiStatus, fetchBackendPolymarketStatus } from "@/lib/api-server";
import type { KalshiIntegrationStatus, PolymarketIntegrationStatus } from "@/lib/types";

async function loadPolymarketStatus(): Promise<PolymarketIntegrationStatus> {
  const remote = await fetchBackendPolymarketStatus();
  if (remote) return remote;

  return {
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
}

async function loadKalshiStatus(): Promise<KalshiIntegrationStatus> {
  const remote = await fetchBackendKalshiStatus();
  if (remote) return remote;

  return {
    provider: "kalshi",
    enabled: true,
    healthy: false,
    baseUrl: "https://api.elections.kalshi.com/trade-api/v2",
    authMode: "public",
    hasApiCredentials: false,
    redis: "unavailable",
    api: "unknown",
    marketSampleSize: null,
    latencyMs: null,
    cachedMarketCount: null,
    error: "Backend API not configured — set NEXT_PUBLIC_API_URL",
  };
}

export default async function PlatformIntegrationsPage() {
  const [polymarket, kalshi] = await Promise.all([loadPolymarketStatus(), loadKalshiStatus()]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Integrations"
          subtitle="External market data providers and connection health"
        />
        <CardBody>
          <p className="text-sm text-muted">
            Monitor third-party integrations used by the trading platform. Polymarket and Kalshi
            supply live market listings; Kalshi also powers virtual demo evaluation accounts with
            challenge rule enforcement.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <PolymarketIntegrationCard status={polymarket} />
        <KalshiIntegrationCard status={kalshi} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Polymarket API" subtitle="REST reference" />
          <CardBody className="space-y-3 text-sm text-muted">
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>
                <code>GET /api/polymarket/status</code>
              </li>
              <li>
                <code>GET /api/polymarket/markets</code>
              </li>
              <li>
                <code>GET /api/polymarket/search?q=…</code>
              </li>
            </ul>
            <p className="text-xs">
              See <code>backend/integrations/polymarket/README.md</code> for environment variables.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Kalshi API" subtitle="REST reference" />
          <CardBody className="space-y-3 text-sm text-muted">
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>
                <code>GET /api/kalshi/status</code>
              </li>
              <li>
                <code>GET /api/kalshi/markets</code>
              </li>
              <li>
                <code>POST /api/v1/webhooks/accounts</code> — provision demo account
              </li>
              <li>
                <code>POST /api/v1/admin/accounts/provision</code> — manual issuance
              </li>
            </ul>
            <p className="text-xs">
              See <code>backend/integrations/kalshi/README.md</code> for demo accounts and API keys.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
