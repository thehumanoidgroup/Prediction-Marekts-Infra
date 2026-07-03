import { PolymarketIntegrationCard } from "@/components/platform/polymarket-integration-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getPolymarketIntegrationStatus } from "@/lib/polymarket/service";

export default async function PlatformIntegrationsPage() {
  const polymarket = await getPolymarketIntegrationStatus();

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
              <p className="font-medium text-foreground">API routes</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                <li>
                  <code>GET /api/polymarket/markets</code>
                </li>
                <li>
                  <code>GET /api/polymarket/search?q=…</code>
                </li>
                <li>
                  <code>GET /api/polymarket/markets/{"{id}"}</code>
                </li>
                <li>
                  <code>GET /api/platform/integrations/polymarket</code>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground">Environment</p>
              <p className="mt-1 text-xs">
                Configure <code>POLYMARKET_*</code> variables for CLOB host, chain ID, and optional
                trading credentials. Read-only listings require no API keys.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
