import Link from "next/link";
import type { Metadata } from "next";
import { getRequestTenant } from "@/lib/tenant-server";
import {
  getAccount,
  getJournal,
  getPortfolioSummary,
  getPositions,
  listMarkets,
} from "@/lib/services";
import {
  formatPct,
  formatSignedPct,
  formatSignedUsd,
  formatUsd,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EquityChart } from "@/components/charts/equity-chart";
import { ChallengePanel } from "@/components/dashboard/challenge-panel";
import { JournalCard } from "@/components/dashboard/journal-card";
import { MoversList } from "@/components/dashboard/movers-list";
import { PortfolioCard } from "@/components/dashboard/portfolio-card";
import { PositionsTable } from "@/components/dashboard/positions-table";
import { StatCards, type Stat } from "@/components/dashboard/stat-cards";
import { FeedStatusDot } from "@/components/markets/live-price";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const tenant = await getRequestTenant();
  const account = getAccount(tenant.id);
  const summary = getPortfolioSummary(tenant.id);
  const positions = getPositions(tenant.id);
  const journal = getJournal(tenant.id).slice(0, 4);
  const movers = listMarkets({ sort: "movers" }).slice(0, 5);

  const totalPnlPct = (account.totalPnl / account.startingBalance) * 100;
  const profitTargetUsd =
    account.startingBalance * (1 + account.profitTargetPct / 100);

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
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <span className="hidden sm:inline-flex">
              <FeedStatusDot />
            </span>
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

      <StatCards stats={stats} />

      {/* Main grid: rail first on mobile for challenge visibility */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="order-1 flex min-w-0 flex-col gap-4 xl:order-2">
          <ChallengePanel account={account} />
          <PortfolioCard summary={summary} openPositions={positions.length} />
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
              <MoversList markets={movers} />
            </CardBody>
          </Card>
        </div>

        <div className="order-2 flex min-w-0 flex-col gap-4 xl:order-1 xl:col-span-2">
          <Card>
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
              <PositionsTable positions={positions} />
            </CardBody>
          </Card>

          <JournalCard entries={journal} />
        </div>
      </div>
    </div>
  );
}
