/** Integration status card for Kalshi on the Super Admin dashboard. */

import type { ReactNode } from "react";
import type { KalshiIntegrationStatus } from "@/lib/types";
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
  if (healthy === false) {
    return <Badge tone="warn">Degraded</Badge>;
  }
  return <Badge tone="neutral">{state}</Badge>;
}

export function KalshiIntegrationCard({ status }: { status: KalshiIntegrationStatus }) {
  return (
    <Card className="border-l-[3px] border-l-[#22c55e]">
      <CardHeader
        title="Kalshi"
        subtitle="Trading API · demo account market data"
        action={
          status.healthy ? (
            <Badge tone="up">Healthy</Badge>
          ) : (
            <Badge tone="down">Unhealthy</Badge>
          )
        }
      />
      <CardBody>
        <dl>
          <StatusRow
            label="Trading API"
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
          <StatusRow label="Auth mode" value={<span className="capitalize">{status.authMode}</span>} />
          <StatusRow
            label="API key configured"
            value={
              status.hasApiCredentials ? (
                <Badge tone="up">Yes</Badge>
              ) : (
                <Badge tone="warn">Not set</Badge>
              )
            }
          />
          <StatusRow
            label="Redis cache"
            value={connectionBadge(status.redis, status.redis === "connected")}
          />
          <StatusRow label="Cached markets" value={status.cachedMarketCount ?? "—"} />
          <StatusRow label="Sample page size" value={status.marketSampleSize ?? "—"} />
        </dl>

        {status.error ? (
          <p className="mt-4 rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-xs text-down">
            {status.error}
          </p>
        ) : null}

        <p className="mt-4 text-xs text-faint">
          Public market listings work without credentials. Set{" "}
          <code className="text-muted">PP_KALSHI_API_KEY</code> and{" "}
          <code className="text-muted">PP_KALSHI_API_SECRET</code> for authenticated endpoints.
          Demo accounts use live Kalshi prices with virtual bankrolls — see{" "}
          <code className="text-muted">backend/integrations/kalshi/README.md</code>.
        </p>
      </CardBody>
    </Card>
  );
}
