import { AlpacaIntegrationCard } from "@/components/platform/alpaca-integration-card";
import { KalshiIntegrationCard } from "@/components/platform/kalshi-integration-card";
import { PolymarketIntegrationCard } from "@/components/platform/polymarket-integration-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getAlpacaIntegrationStatus } from "@/lib/sp500/service";
import { getKalshiIntegrationStatus } from "@/lib/kalshi/service";
import { getPolymarketIntegrationStatus } from "@/lib/polymarket/service";

export default async function PlatformIntegrationsPage() {
  const [polymarket, kalshi, alpaca] = await Promise.all([
    getPolymarketIntegrationStatus(),
    getKalshiIntegrationStatus(),
    getAlpacaIntegrationStatus(),
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
            supply prediction-market listings; Alpaca IEX powers S&P 500 0DTE & weekly stock markets
            for the MVP (Polygon.io will replace Alpaca when scaling many accounts).
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <PolymarketIntegrationCard status={polymarket} />
        <KalshiIntegrationCard status={kalshi} />
        <AlpacaIntegrationCard status={alpaca} />
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

        <Card>
          <CardHeader title="Alpaca API" subtitle="Market Data IEX · S&P 500 MVP" />
          <CardBody className="space-y-3 text-sm text-muted">
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>
                <code>GET /api/platform/integrations/alpaca</code> — connection status
              </li>
              <li>
                <code>GET /api/markets?source=sp500_dynamic</code>
              </li>
              <li>
                <code>GET /v2/stocks/snapshots</code> (upstream) — live spots
              </li>
              <li>
                <code>GET /v2/stocks/{"{symbol}"}/bars</code> (upstream) — EOD closes
              </li>
            </ul>
            <p className="text-xs">
              Paper keys: <code>ALPACA_API_KEY</code> / <code>ALPACA_SECRET_KEY</code>. Docs:{" "}
              <a
                href="https://alpaca.markets/docs/"
                className="text-accent hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                alpaca.markets/docs
              </a>
              {" · "}
              <a
                href="https://alpaca.markets/docs/api-references/market-data-api/"
                className="text-accent hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Market Data API
              </a>
              . Polygon.io will replace Alpaca when scaling many accounts.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
