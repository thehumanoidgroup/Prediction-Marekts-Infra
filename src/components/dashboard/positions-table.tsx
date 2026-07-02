import Link from "next/link";
import type { EnrichedPosition } from "@/lib/services";
import { formatCents, formatShares, formatSignedPct, formatSignedUsd, formatUsdPrecise } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Open positions table, shared by the dashboard and portfolio pages. */
export function PositionsTable({
  positions,
  emptyMessage = "No open positions. Find a market to trade.",
}: {
  positions: EnrichedPosition[];
  emptyMessage?: string;
}) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted">{emptyMessage}</p>
        <Link
          href="/markets"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Browse markets
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-faint">
            <th className="pb-2 pr-4 font-medium">Market</th>
            <th className="pb-2 pr-4 font-medium">Side</th>
            <th className="tabular pb-2 pr-4 text-right font-medium">Shares</th>
            <th className="tabular pb-2 pr-4 text-right font-medium">Avg / Mark</th>
            <th className="tabular pb-2 pr-4 text-right font-medium">Value</th>
            <th className="tabular pb-2 text-right font-medium">P&L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const up = position.pnl >= 0;
            return (
              <tr
                key={position.id}
                className="group border-b border-edge/60 last:border-0 hover:bg-surface-2/60"
              >
                <td className="max-w-64 py-3 pr-4">
                  <Link
                    href={`/markets/${position.marketId}`}
                    className="line-clamp-2 font-medium text-foreground transition-colors group-hover:text-accent"
                  >
                    {position.market.question}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <Badge tone={position.outcome === "yes" ? "up" : "down"}>
                    {position.outcome.toUpperCase()}
                  </Badge>
                </td>
                <td className="tabular py-3 pr-4 text-right text-muted">
                  {formatShares(position.shares)}
                </td>
                <td className="tabular py-3 pr-4 text-right text-muted">
                  {formatCents(position.avgPrice)}
                  <span className="text-faint"> → </span>
                  <span className="text-foreground">{formatCents(position.currentPrice)}</span>
                </td>
                <td className="tabular py-3 pr-4 text-right text-foreground">
                  {formatUsdPrecise(position.value)}
                </td>
                <td className={cn("tabular py-3 text-right font-medium", up ? "text-up" : "text-down")}>
                  {formatSignedUsd(position.pnl)}
                  <span className="ml-1.5 text-xs opacity-80">
                    {formatSignedPct(position.pnlPct)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
