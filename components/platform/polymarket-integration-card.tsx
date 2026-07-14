/** Integration status card for the Super Admin dashboard. */

import type { ReactNode } from "react";
import type { PolymarketIntegrationStatus } from "@/lib/types";
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

export function PolymarketIntegrationCard({
  status,
}: {
  status: PolymarketIntegrationStatus;
}) {
  return (
    <Card className="border-l-[3px] border-l-[#6366f1]">
      <CardHeader
        title="Polymarket"
        subtitle="CLOB market data via py-clob-client-v2"
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
            label="CLOB API"
            value={
              <span className="flex items-center gap-2">
                {connectionBadge(status.clob, status.healthy)}
                {status.latencyMs != null ? (
                  <span className="tabular text-xs text-faint">{status.latencyMs}ms</span>
                ) : null}
              </span>
            }
          />
          <StatusRow label="Host" value={<code className="text-xs">{status.host}</code>} />
          <StatusRow label="Chain ID" value={status.chainId} />
          <StatusRow
            label="Auth mode"
            value={
              <span className="capitalize">
                {status.authMode}
                {status.canTrade ? " · can trade" : ""}
              </span>
            }
          />
          <StatusRow
            label="Redis cache"
            value={connectionBadge(status.redis, status.redis === "connected")}
          />
          <StatusRow
            label="Cached markets"
            value={status.cachedMarketCount ?? "—"}
          />
          <StatusRow
            label="Sample page size"
            value={status.marketSampleSize ?? "—"}
          />
        </dl>

        {status.error ? (
          <p className="mt-4 rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-xs text-down">
            {status.error}
          </p>
        ) : null}

        <p className="mt-4 text-xs text-faint">
          Read-only market listings work without credentials. Set{" "}
          <code className="text-muted">PP_POLYMARKET_PRIVATE_KEY</code> and API credentials for
          trading. See{" "}
          <code className="text-muted">backend/integrations/polymarket/README.md</code>.
        </p>
      </CardBody>
    </Card>
  );
}

export function PolymarketIntegrationSkeleton() {
  return (
    <Card className="border-l-[3px] border-l-[#6366f1]">
      <CardBody className="pt-5">
        <div className="h-48 animate-pulse rounded-lg bg-surface-2" />
      </CardBody>
    </Card>
  );
}
