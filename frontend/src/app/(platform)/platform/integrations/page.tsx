import { PolymarketIntegrationCard } from "@/components/platform/polymarket-integration-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { fetchBackendPolymarketStatus } from "@/lib/api-server";
import type { PolymarketIntegrationStatus } from "@/lib/types";

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

export default async function PlatformIntegrationsPage() {
  const polymarket = await loadPolymarketStatus();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Integrations"
          subtitle="External market data providers and connection health"
        />
        <CardBody>
          <p className="text-sm text-muted">
            Monitor third-party integrations used by the trading platform. Polymarket supplies
            live CLOB market listings displayed alongside internal LMSR markets.
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <PolymarketIntegrationCard status={polymarket} />

        <Card>
          <CardHeader title="API reference" subtitle="Polymarket REST endpoints" />
          <CardBody className="space-y-3 text-sm text-muted">
            <div>
              <p className="font-medium text-foreground">Backend routes</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                <li>
                  <code>GET /api/polymarket/status</code>
                </li>
                <li>
                  <code>GET /api/polymarket/markets</code>
                </li>
                <li>
                  <code>GET /api/polymarket/search?q=…</code>
                </li>
                <li>
                  <code>GET /api/polymarket/markets/{"{id}"}</code>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">Documentation</p>
              <p className="mt-1 text-xs">
                See <code>backend/integrations/polymarket/README.md</code> for SDK usage,
                environment variables, and Python examples.
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Environment</p>
              <p className="mt-1 text-xs">
                Configure <code>PP_POLYMARKET_*</code> and <code>PP_REDIS_URL</code> in the
                backend environment. Read-only listings require no API keys.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
