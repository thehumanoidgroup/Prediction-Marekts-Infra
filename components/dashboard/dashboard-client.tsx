"use client";

import Link from "next/link";
import type { TenantConfig } from "@/lib/tenants";
import type { DashboardData } from "@/hooks/use-dashboard-data";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  formatPct,
  formatSignedPct,
  formatSignedUsd,
  formatUsd,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EquityChart } from "@/components/charts/equity-chart";
import { ChallengePanel } from "@/components/dashboard/challenge-panel";
import { LiveEventsSection } from "@/components/live-events/live-events-section";
import { KalshiMarketsSection } from "@/components/dashboard/kalshi-markets-section";
import { Sp500MarketsSection } from "@/components/dashboard/sp500-markets-section";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { JournalCard } from "@/components/dashboard/journal-card";
import { LivePositionsTable } from "@/components/dashboard/live-positions";
import { MoversList } from "@/components/dashboard/movers-list";
import { PortfolioCard } from "@/components/dashboard/portfolio-card";
import { StatCards, type Stat } from "@/components/dashboard/stat-cards";
import { FeedStatusDot } from "@/components/markets/live-price";
import { cn } from "@/lib/utils";

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-down/30 bg-down-soft px-4 py-3">
      <p className="text-sm font-medium text-down">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function DashboardClient({
  tenant,
  initial,
}: {
  tenant: TenantConfig;
  initial?: Partial<DashboardData>;
}) {
  const { portfolio, journal, movers, refreshing, reload } = useDashboardData(initial);

  if (portfolio.status === "loading" && !initial?.account) {
    return <DashboardSkeleton />;
  }

  if (portfolio.status === "error") {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <ErrorBanner message={portfolio.error} onRetry={reload} />
      </div>
    );
  }

  if (portfolio.status !== "success") {
    return <DashboardSkeleton />;
  }

  const { account, summary, positions } = portfolio.data;
  const journalEntries =
    journal.status === "success" ? journal.data.slice(0, 4) : initial?.journal?.slice(0, 4) ?? [];
  const moverMarkets =
    movers.status === "success" ? movers.data : initial?.movers ?? [];

  const totalPnlPct = (account.totalPnl / account.startingBalance) * 100;
  const profitTargetUsd = account.startingBalance * (1 + account.profitTargetPct / 100);

  const stats: Stat[] = [
    {
      label: "Account equity",
      value: formatUsd(account.equity),
      sub: `${formatUsd(account.startingBalance)} starting`,
      trend: "flat",
    },
    {
      label: "Today's P&L",
      value: formatSignedUsd(account.dailyPnl),
      sub: formatSignedPct((account.dailyPnl / account.startingBalance) * 100, 2),
      trend: account.dailyPnl >= 0 ? "up" : "down",
    },
    {
      label: "Total P&L",
      value: formatSignedUsd(account.totalPnl),
      sub: `${formatSignedPct(totalPnlPct)} of target ${formatPct(account.profitTargetPct, 0)}`,
      trend: account.totalPnl >= 0 ? "up" : "down",
    },
    {
      label: "Win rate",
      value: formatPct(summary.winRate),
      sub: `${summary.totalTrades} closed trades`,
      trend: summary.winRate >= 50 ? "up" : "down",
    },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <ProviderBadge provider={account.provider} />
            <span className="hidden sm:inline-flex">
              <FeedStatusDot />
            </span>
            {refreshing ? (
              <span className="text-[11px] font-medium text-muted">Updating…</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {tenant.name} · {account.label}
          </p>
        </div>
        <Link
          href="/markets"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-[0_0_20px_-4px_var(--tenant-accent)] transition-all hover:bg-accent-hover active:scale-[0.98]"
        >
          Trade markets
        </Link>
      </div>

      {journal.status === "error" ? (
        <ErrorBanner message={journal.error} onRetry={reload} />
      ) : null}

      <StatCards stats={stats} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="order-1 flex min-w-0 flex-col gap-4 xl:order-2">
          <ChallengePanel account={account} />
          <PortfolioCard summary={summary} openPositions={positions.length} account={account} />
          <Card>
            <CardHeader
              title="Top movers"
              subtitle="Live · biggest 24h shifts"
              action={
                <Link
                  href="/markets"
                  className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
                >
                  All markets
                </Link>
              }
            />
            <CardBody>
              {movers.status === "loading" ? (
                <p className="py-6 text-center text-sm text-muted">Loading markets…</p>
              ) : (
                <MoversList markets={moverMarkets} />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-1 xl:col-span-2">
          <Card className={cn(refreshing && "opacity-95 transition-opacity")}>
            <CardHeader
              title="Equity curve"
              subtitle="Last 30 days, marked to market"
              action={
                <Badge tone={account.totalPnl >= 0 ? "up" : "down"}>
                  {formatSignedPct(totalPnlPct)}
                </Badge>
              }
            />
            <CardBody>
              <EquityChart
                data={account.equityCurve}
                baseline={account.startingBalance}
                profitTarget={profitTargetUsd}
                currentEquity={account.equity}
                totalPnl={account.totalPnl}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Open positions"
              subtitle={`${positions.length} open · ${formatSignedUsd(summary.openPnl)} unrealized`}
              action={
                <Link
                  href="/portfolio"
                  className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
                >
                  View all
                </Link>
              }
            />
            <CardBody>
              <LivePositionsTable positions={positions} />
            </CardBody>
          </Card>

          <JournalCard entries={journalEntries} />

          {account.provider === "kalshi" ? <KalshiMarketsSection /> : null}
          {account.provider === "sp500_dynamic" ? <Sp500MarketsSection /> : null}

          <LiveEventsSection />
        </div>
      </div>
    </div>
  );
}
