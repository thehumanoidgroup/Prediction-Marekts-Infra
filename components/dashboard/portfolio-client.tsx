"use client";

import type { EnrichedPosition } from "@/lib/services";
import type { ChallengeAccount, PortfolioSummary } from "@/lib/types";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  formatPct,
  formatSignedUsd,
  formatUsd,
  formatUsdPrecise,
} from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { EquityChart } from "@/components/charts/equity-chart";
import { OpenPositionsPanel } from "@/components/dashboard/open-positions-panel";
import { StatCards, type Stat } from "@/components/dashboard/stat-cards";
import { FeedStatusDot } from "@/components/markets/live-price";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PortfolioClient({
  initial,
}: {
  initial: {
    account: ChallengeAccount;
    summary: PortfolioSummary;
    positions: EnrichedPosition[];
  };
}) {
  const { portfolio, refreshing, reload } = useDashboardData({
    account: initial.account,
    summary: initial.summary,
    positions: initial.positions,
  });

  const account =
    portfolio.status === "success" ? portfolio.data.account : initial.account;
  const summary =
    portfolio.status === "success" ? portfolio.data.summary : initial.summary;
  const positions =
    portfolio.status === "success" ? portfolio.data.positions : initial.positions;

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">My Portfolio</h1>
            <ProviderBadge provider={account.provider} />
            <FeedStatusDot />
            {refreshing ? (
              <span className="text-[11px] font-medium text-muted">Updating…</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {account.label} · started {new Date(account.startedAt).toLocaleDateString()}
          </p>
        </div>
        {portfolio.status === "error" ? (
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        ) : null}
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

      <OpenPositionsPanel
        positions={positions}
        summary={summary}
        title="Open positions"
        showTotals
      />
    </div>
  );
}
