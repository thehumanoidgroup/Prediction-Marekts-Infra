"use client";

import { useMemo } from "react";
import type { EnrichedPosition } from "@/lib/services";
import type { ChallengeAccount, PortfolioSummary } from "@/lib/types";
import { buildChallengeWarnings } from "@/lib/challenge-warnings";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  formatPct,
  formatSignedUsd,
  formatUsd,
  formatUsdPrecise,
} from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EquityChart } from "@/components/charts/equity-chart";
import { OpenPositionsPanel } from "@/components/dashboard/open-positions-panel";
import { ChallengeRiskBanners } from "@/components/dashboard/challenge-risk-banners";
import { ChallengePanel } from "@/components/dashboard/challenge-panel";
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

  const isLoading = portfolio.status === "loading" && !initial.account;
  const isError = portfolio.status === "error";

  const account =
    portfolio.status === "success" ? portfolio.data.account : initial.account;
  const summary =
    portfolio.status === "success" ? portfolio.data.summary : initial.summary;
  const positions =
    portfolio.status === "success" ? portfolio.data.positions : initial.positions;

  const warnings = useMemo(
    () => buildChallengeWarnings(account, summary),
    [account, summary],
  );

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

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4" aria-busy="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <OpenPositionsPanel positions={[]} loading />
      </div>
    );
  }

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
        {isError ? (
          <Button variant="secondary" size="sm" onClick={reload}>
            Retry
          </Button>
        ) : null}
      </div>

      {isError ? (
        <div className="rounded-xl border border-down/30 bg-down-soft px-4 py-3 text-sm text-down">
          Could not refresh live portfolio data. Showing the last known snapshot.
        </div>
      ) : null}

      <ChallengeRiskBanners warnings={warnings} />

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
        <div className="flex flex-col gap-4">
          <ChallengePanel account={account} />
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
      </div>

      <OpenPositionsPanel
        positions={positions}
        summary={summary}
        title="Open positions"
        showTotals
        loading={refreshing && positions.length === 0}
      />
    </div>
  );
}
