import Link from "next/link";
import { getRequestTenant } from "@/lib/tenant-server";
import { getFirmStats, getFirmTraders } from "@/lib/services";
import { formatCompactUsd, formatPct, formatSignedUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCards, type Stat } from "@/components/dashboard/stat-cards";
import { RiskMonitor, type RiskRow } from "@/components/admin/risk-monitor";
import { cn } from "@/lib/utils";

export default async function AdminOverviewPage() {
  const tenant = await getRequestTenant();
  const stats = getFirmStats(tenant.id);
  const traders = getFirmTraders(tenant.id);

  const kpis: Stat[] = [
    {
      label: "Active traders",
      value: `${stats.activeTraders}`,
      sub: `${stats.atRiskTraders} at risk`,
      trend: stats.atRiskTraders > 0 ? "down" : "up",
    },
    {
      label: "Pass rate",
      value: formatPct(stats.passRate),
      sub: `${stats.fundedTraders} funded · ${stats.failedTraders} failed`,
      trend: stats.passRate >= 50 ? "up" : "down",
    },
    {
      label: "Trader equity",
      value: formatCompactUsd(stats.totalEquity),
      sub: `${formatSignedUsd(stats.totalPnl)} aggregate P&L`,
      trend: stats.totalPnl >= 0 ? "up" : "down",
    },
    {
      label: "Avg win rate",
      value: formatPct(stats.avgWinRate),
      sub: "Across all accounts",
      trend: "flat",
    },
  ];

  const riskRows: RiskRow[] = traders
    .filter((t) => t.status === "active")
    .map((t) => ({
      id: t.id,
      name: t.name,
      accountSize: t.accountSize,
      equity: t.equity,
      floor: Math.round(t.accountSize * (1 - tenant.program.maxDrawdownPct / 100)),
      dailyLossUsedPct: t.dailyLossUsedPct,
    }));

  const topTraders = traders.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <StatCards stats={kpis} />
      <RiskMonitor rows={riskRows} />
      <Card>
        <CardHeader
          title="Top performers"
          subtitle="Ranked by return"
          action={
            <Link
              href="/admin/traders"
              className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
            >
              All traders
            </Link>
          }
        />
        <CardBody>
          <ul className="divide-y divide-edge/60">
            {topTraders.map((trader) => (
              <li key={trader.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold">
                    {trader.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{trader.name}</p>
                    <p className="text-[11px] text-faint">
                      {trader.country} · {formatCompactUsd(trader.accountSize)} account
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    tone={
                      trader.status === "passed"
                        ? "up"
                        : trader.status === "failed"
                          ? "down"
                          : "accent"
                    }
                  >
                    {trader.status}
                  </Badge>
                  <span
                    className={cn(
                      "tabular w-16 text-right text-sm font-semibold",
                      trader.pnlPct >= 0 ? "text-up" : "text-down",
                    )}
                  >
                    {trader.pnlPct >= 0 ? "+" : ""}
                    {trader.pnlPct}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
