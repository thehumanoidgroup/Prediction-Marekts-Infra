import Link from "next/link";
import type { ChallengeAccount, PortfolioSummary } from "@/lib/types";
import { formatSignedUsd, formatUsd } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { cn } from "@/lib/utils";

/** Compact portfolio rail card for the dashboard side column. */
export function PortfolioCard({
  summary,
  openPositions,
  account,
}: {
  summary: PortfolioSummary;
  openPositions: number;
  account?: Pick<ChallengeAccount, "provider" | "label">;
}) {
  const rows: Array<{ label: string; value: string; tone?: "up" | "down" }> = [
    { label: "Cash balance", value: formatUsd(summary.balance) },
    { label: "Equity", value: formatUsd(summary.equity) },
    {
      label: "Open P&L",
      value: formatSignedUsd(summary.openPnl),
      tone: summary.openPnl >= 0 ? "up" : "down",
    },
    {
      label: "Today's P&L",
      value: formatSignedUsd(summary.dailyPnl),
      tone: summary.dailyPnl >= 0 ? "up" : "down",
    },
    { label: "Open positions", value: `${openPositions}` },
  ];

  return (
    <Card>
      <CardHeader
        title="My Portfolio"
        action={
          <div className="flex items-center gap-2">
            <ProviderBadge provider={account?.provider} compact />
            <Link
              href="/portfolio"
              className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
            >
              Open positions
            </Link>
          </div>
        }
      />
      <CardBody>
        <dl className="divide-y divide-edge/60">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2 text-sm">
              <dt className="text-muted">{row.label}</dt>
              <dd
                className={cn(
                  "tabular font-semibold",
                  row.tone === "up" && "text-up",
                  row.tone === "down" && "text-down",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
