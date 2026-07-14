import { KalshiIntegrationCard } from "@/components/platform/kalshi-integration-card";
import { PolymarketIntegrationCard } from "@/components/platform/polymarket-integration-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getKalshiIntegrationStatus } from "@/lib/kalshi/service";
import { getPolymarketIntegrationStatus } from "@/lib/polymarket/service";

export default async function PlatformIntegrationsPage() {
  const [polymarket, kalshi] = await Promise.all([
    getPolymarketIntegrationStatus(),
    getKalshiIntegrationStatus(),
  ]);

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
            supply live market listings; Kalshi demo accounts are provisioned in-process via Prisma.
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
                <code>GET /api/polymarket/markets</code>
              </li>
              <li>
                <code>GET /api/polymarket/search?q=…</code>
              </li>
              <li>
                <code>GET /api/platform/integrations/polymarket</code>
              </li>
            </ul>
            <p className="text-xs">
              Configure <code>POLYMARKET_*</code> environment variables. Read-only listings require
              no API keys.
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
                <code>GET /api/markets?source=kalshi</code>
              </li>
              <li>
                <code>POST /api/admin/accounts/provision</code> — manual Kalshi issuance
              </li>
              <li>
                <code>POST /api/provisioning/webhook</code> — purchase webhook
              </li>
            </ul>
            <p className="text-xs">
              Public Kalshi market data is fetched in-process. Optional{" "}
              <code>PP_KALSHI_API_KEY</code> / <code>PP_KALSHI_API_SECRET</code> for authenticated
              endpoints.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
