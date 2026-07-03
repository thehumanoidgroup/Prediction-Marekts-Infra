"use client";

import { useMemo, useState } from "react";
import type { AdminTrader, TraderStatus } from "@/lib/types";
import { formatCompactUsd, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { IconSearch } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const statusFilters: Array<{ id: TraderStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "passed", label: "Passed" },
  { id: "failed", label: "Failed" },
];

const statusTones: Record<TraderStatus, "accent" | "up" | "down"> = {
  active: "accent",
  passed: "up",
  failed: "down",
};

const phaseLabels = {
  evaluation: "Evaluation",
  verification: "Verification",
  funded: "Funded",
} as const;

/** Firm trader roster with performance metrics, search and status filters. */
export function TradersTable({ traders }: { traders: AdminTrader[] }) {
  const [status, setStatus] = useState<TraderStatus | "all">("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    let filtered = traders;
    if (status !== "all") filtered = filtered.filter((t) => t.status === status);
    const q = query.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [traders, status, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search traders…"
            className="h-9 w-full rounded-lg border border-edge bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-edge-strong"
          />
        </div>
        <div className="flex rounded-lg border border-edge bg-surface-2 p-0.5">
          {statusFilters.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStatus(option.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                status === option.id
                  ? "bg-surface-3 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="pb-2 pr-4 font-medium">Trader</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Account</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Equity</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">P&L</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Win rate</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Trades</th>
              <th className="pb-2 font-medium">DD used</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trader) => (
              <tr
                key={trader.id}
                className="border-b border-edge/60 last:border-0 hover:bg-surface-2/60"
              >
                <td className="py-3 pr-4">
                  <p className="font-medium text-foreground">{trader.name}</p>
                  <p className="text-[11px] text-faint">
                    {trader.email} · {trader.country}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={statusTones[trader.status]}>{trader.status}</Badge>
                    <span className="text-[10px] text-faint">{phaseLabels[trader.phase]}</span>
                  </div>
                </td>
                <td className="tabular py-3 pr-4 text-right text-muted">
                  {formatCompactUsd(trader.accountSize)}
                </td>
                <td className="tabular py-3 pr-4 text-right text-foreground">
                  {formatUsd(trader.equity)}
                </td>
                <td
                  className={cn(
                    "tabular py-3 pr-4 text-right font-semibold",
                    trader.pnlPct >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {trader.pnlPct >= 0 ? "+" : ""}
                  {trader.pnlPct}%
                </td>
                <td className="tabular py-3 pr-4 text-right text-muted">
                  {formatPct(trader.winRate)}
                </td>
                <td className="tabular py-3 pr-4 text-right text-muted">{trader.trades}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Progress
                      value={trader.drawdownUsedPct}
                      tone={
                        trader.drawdownUsedPct >= 75
                          ? "down"
                          : trader.drawdownUsedPct >= 45
                            ? "warn"
                            : "up"
                      }
                      className="w-20"
                    />
                    <span className="tabular text-[11px] text-muted">
                      {trader.drawdownUsedPct}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No traders match your filters.</p>
        ) : null}
      </div>
    </div>
  );
}
