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
            supply live market listings; Kalshi also powers virtual demo evaluation accounts when the
            Python backend is connected.
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
                <code>GET /api/kalshi/status</code> (Python backend)
              </li>
              <li>
                <code>GET /api/kalshi/markets</code> (Python backend)
              </li>
              <li>
                <code>POST /api/v1/webhooks/accounts</code> — purchase webhook
              </li>
              <li>
                <code>POST /api/v1/admin/accounts/provision</code> — manual issuance
              </li>
            </ul>
            <p className="text-xs">
              See <code>backend/integrations/kalshi/README.md</code> for demo accounts and API keys.
              Set <code>API_URL</code> to proxy Kalshi routes from this Next.js app.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
