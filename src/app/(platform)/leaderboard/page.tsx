import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRequestTenant } from "@/lib/tenant-server";
import { getTenantLeaderboard } from "@/lib/services";
import { formatCompactUsd, formatPct, formatSignedPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };

const phaseTones = {
  funded: "up",
  verification: "accent",
  evaluation: "neutral",
} as const;

const phaseLabels = {
  funded: "Funded",
  verification: "Verification",
  evaluation: "Evaluation",
} as const;

export default async function LeaderboardPage() {
  const tenant = await getRequestTenant();
  if (!tenant.features.leaderboard) notFound();

  const leaderboard = getTenantLeaderboard(tenant.id);
  const podium = leaderboard.slice(0, 3);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-0.5 text-sm text-muted">
          Top {tenant.name} traders this month, ranked by return
        </p>
      </div>

      {/* Podium */}
      <div className="grid gap-3 sm:grid-cols-3">
        {podium.map((entry) => (
          <Card
            key={entry.rank}
            className={cn(entry.rank === 1 && "border-accent/40 bg-accent-soft/40")}
          >
            <CardBody className="pt-4">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-sm font-bold",
                    entry.rank === 1
                      ? "bg-accent text-accent-foreground"
                      : "bg-surface-3 text-foreground",
                  )}
                >
                  {entry.rank}
                </span>
                <Badge tone={phaseTones[entry.phase]}>{phaseLabels[entry.phase]}</Badge>
              </div>
              <p className="mt-3 text-sm font-semibold">{entry.trader}</p>
              <p className="text-[11px] text-faint">
                {entry.country} · {formatCompactUsd(entry.accountSize)} account
              </p>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="tabular text-lg font-bold text-up">
                  {formatSignedPct(entry.profitPct)}
                </span>
                <span className="tabular text-xs text-muted">{formatUsd(entry.profit)}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Full table */}
      <Card>
        <CardBody className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Trader</th>
                  <th className="pb-2 pr-4 font-medium">Phase</th>
                  <th className="tabular pb-2 pr-4 text-right font-medium">Account</th>
                  <th className="tabular pb-2 pr-4 text-right font-medium">Profit</th>
                  <th className="tabular pb-2 pr-4 text-right font-medium">Return</th>
                  <th className="tabular pb-2 pr-4 text-right font-medium">Win rate</th>
                  <th className="tabular pb-2 text-right font-medium">Trades</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.rank}
                    className="border-b border-edge/60 last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="tabular py-3 pr-4 font-semibold text-muted">{entry.rank}</td>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-foreground">{entry.trader}</span>
                      <span className="ml-2 text-[11px] text-faint">{entry.country}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={phaseTones[entry.phase]}>{phaseLabels[entry.phase]}</Badge>
                    </td>
                    <td className="tabular py-3 pr-4 text-right text-muted">
                      {formatCompactUsd(entry.accountSize)}
                    </td>
                    <td className="tabular py-3 pr-4 text-right font-medium text-up">
                      {formatUsd(entry.profit)}
                    </td>
                    <td className="tabular py-3 pr-4 text-right font-semibold text-up">
                      {formatSignedPct(entry.profitPct)}
                    </td>
                    <td className="tabular py-3 pr-4 text-right text-muted">
                      {formatPct(entry.winRate)}
                    </td>
                    <td className="tabular py-3 text-right text-muted">{entry.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
