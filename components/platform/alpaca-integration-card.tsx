/** Integration status card for Alpaca (S&P 500 IEX) on the Super Admin dashboard. */

import type { ReactNode } from "react";
import type { AlpacaIntegrationStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

function StatusRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge/60 py-2.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function connectionBadge(state: string, healthy?: boolean) {
  if (state === "connected") {
    return <Badge tone="up">Connected</Badge>;
  }
  if (state === "error") {
    return <Badge tone="down">Error</Badge>;
  }
  if (state === "unconfigured") {
    return <Badge tone="warn">Not configured</Badge>;
  }
  if (state === "mock") {
    return <Badge tone="neutral">Mock fallback</Badge>;
  }
  if (healthy === false) {
    return <Badge tone="warn">Degraded</Badge>;
  }
  return <Badge tone="neutral">{state}</Badge>;
}

export function AlpacaIntegrationCard({ status }: { status: AlpacaIntegrationStatus }) {
  return (
    <Card className="border-l-[3px] border-l-[#f59e0b]">
      <CardHeader
        title="Alpaca"
        subtitle="Market Data IEX · S&P 500 0DTE & weekly MVP"
        action={
          status.healthy ? (
            <Badge tone="up">Healthy</Badge>
          ) : status.api === "unconfigured" ? (
            <Badge tone="warn">Setup needed</Badge>
          ) : (
            <Badge tone="down">Unhealthy</Badge>
          )
        }
      />
      <CardBody>
        <dl>
          <StatusRow
            label="Market Data API"
            value={
              <span className="flex items-center gap-2">
                {connectionBadge(status.api, status.healthy)}
                {status.latencyMs != null ? (
                  <span className="tabular text-xs text-faint">{status.latencyMs}ms</span>
                ) : null}
              </span>
            }
          />
          <StatusRow
            label="Base URL"
            value={<code className="max-w-[200px] truncate text-xs">{status.baseUrl}</code>}
          />
          <StatusRow label="Feed" value={<span className="uppercase">{status.feed}</span>} />
          <StatusRow
            label="API keys"
            value={
              status.hasApiCredentials ? (
                <Badge tone="up">Configured</Badge>
              ) : (
                <Badge tone="warn">Missing</Badge>
              )
            }
          />
          <StatusRow
            label="Sample quote"
            value={
              status.sampleTicker && status.samplePrice != null ? (
                <span className="tabular">
                  {status.sampleTicker} · ${status.samplePrice.toFixed(2)}
                </span>
              ) : (
                "—"
              )
            }
          />
          <StatusRow label="Dashboard tickers" value={status.sp500TickerCount} />
        </dl>

        {status.error ? (
          <p className="mt-4 rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-xs text-down">
            {status.error}
          </p>
        ) : null}

        <p className="mt-4 text-xs text-faint">
          Free paper keys:{" "}
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
          . Set <code className="text-muted">ALPACA_API_KEY</code> /{" "}
          <code className="text-muted">ALPACA_SECRET_KEY</code>. See{" "}
          <code className="text-muted">backend/integrations/alpaca/README.md</code>.
        </p>
        <p className="mt-2 text-xs text-faint">{status.scalingNote}.</p>
      </CardBody>
    </Card>
  );
}
