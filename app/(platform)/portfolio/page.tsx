import type { Metadata } from "next";
import { hydrateTenantPortfolio } from "@/lib/portfolio-persistence";
import { getRequestTenant } from "@/lib/tenant-server";
import { getAccount, getPortfolioSummary, getPositions } from "@/lib/services";
import { formatPct, formatSignedUsd, formatUsd, formatUsdPrecise } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { EquityChart } from "@/components/charts/equity-chart";
import { PositionsTable } from "@/components/dashboard/positions-table";
import { StatCards, type Stat } from "@/components/dashboard/stat-cards";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const tenant = await getRequestTenant();
  await hydrateTenantPortfolio(tenant.id);
  const account = getAccount(tenant.id);
  const summary = getPortfolioSummary(tenant.id);
  const positions = getPositions(tenant.id);

  const stats: Stat[] = [
    { label: "Balance", value: formatUsd(summary.balance), sub: "Settled cash" },
    {
      label: "Equity",
      value: formatUsd(summary.equity),
      sub: `${formatSignedUsd(summary.openPnl)} unrealized`,
      trend: summary.openPnl >= 0 ? "up" : "down",
    },
    {
      label: "Total P&L",
      value: formatSignedUsd(summary.totalPnl),
      trend: summary.totalPnl >= 0 ? "up" : "down",
      sub: "Since challenge start",
    },
    {
      label: "Profit factor",
      value: Number.isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : "∞",
      sub: `${formatPct(summary.winRate)} win rate`,
      trend: summary.profitFactor >= 1 ? "up" : "down",
    },
  ];

  const tradeStats: Array<{ label: string; value: string; tone?: "up" | "down" }> = [
    { label: "Closed trades", value: `${summary.totalTrades}` },
    { label: "Win rate", value: formatPct(summary.winRate) },
    { label: "Average win", value: formatUsdPrecise(summary.avgWin), tone: "up" },
    { label: "Average loss", value: formatUsdPrecise(summary.avgLoss), tone: "down" },
    { label: "Best day", value: formatSignedUsd(summary.bestDay), tone: "up" },
    { label: "Worst day", value: formatSignedUsd(summary.worstDay), tone: "down" },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Portfolio</h1>
          <ProviderBadge provider={account.provider} />
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {account.label} · started {new Date(account.startedAt).toLocaleDateString()}
        </p>
      </div>

      <StatCards stats={stats} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Equity curve" subtitle="Last 30 days" />
          <CardBody>
            <EquityChart
              data={account.equityCurve}
              baseline={account.startingBalance}
              currentEquity={account.equity}
              totalPnl={account.totalPnl}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Trade statistics" subtitle="Closed trades only" />
          <CardBody>
            <dl className="divide-y divide-edge/60">
              {tradeStats.map((stat) => (
                <div key={stat.label} className="flex items-center justify-between py-2.5 text-sm">
                  <dt className="text-muted">{stat.label}</dt>
                  <dd
                    className={cn(
                      "tabular font-semibold",
                      stat.tone === "up" && "text-up",
                      stat.tone === "down" && "text-down",
                    )}
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Open positions"
          subtitle={`${positions.length} open · ${formatSignedUsd(summary.openPnl)} unrealized`}
        />
        <CardBody>
          <PositionsTable positions={positions} />
        </CardBody>
      </Card>
    </div>
  );
}
