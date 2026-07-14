"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { EnrichedPosition } from "@/lib/services";
import { useLivePrice } from "@/lib/live-prices";
import {
  formatCents,
  formatShares,
  formatSignedPct,
  formatSignedUsd,
  formatUsdPrecise,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function LivePositionRow({ position }: { position: EnrichedPosition }) {
  const yesPrice = useLivePrice(position.marketId, position.market.yesPrice);
  const currentPrice = position.outcome === "yes" ? yesPrice : 1 - yesPrice;
  const value = currentPrice * position.shares;
  const cost = position.avgPrice * position.shares;
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const up = pnl >= 0;

  return (
    <>
      {/* Mobile card */}
      <Link
        href={`/markets/${position.marketId}`}
        className="block rounded-xl border border-edge bg-surface-2/60 p-3 transition-colors hover:border-edge-strong md:hidden"
      >
        <p className="line-clamp-2 text-sm font-medium leading-snug">{position.market.question}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <Badge tone={position.outcome === "yes" ? "up" : "down"}>
            {position.outcome.toUpperCase()}
          </Badge>
          <span className={cn("tabular text-sm font-bold", up ? "text-up" : "text-down")}>
            {formatSignedUsd(pnl)}
          </span>
        </div>
      </Link>

      {/* Desktop row */}
      <tr className="group hidden border-b border-edge/60 last:border-0 hover:bg-surface-2/60 md:table-row">
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
          <span className="text-foreground">{formatCents(currentPrice)}</span>
        </td>
        <td className="tabular py-3 pr-4 text-right text-foreground">
          {formatUsdPrecise(value)}
        </td>
        <td className={cn("tabular py-3 text-right font-medium", up ? "text-up" : "text-down")}>
          {formatSignedUsd(pnl)}
          <span className="ml-1.5 text-xs opacity-80">{formatSignedPct(pnlPct)}</span>
        </td>
      </tr>
    </>
  );
}

/** Positions with mark-to-market prices from the live WebSocket feed. */
export function LivePositionsTable({
  positions,
  emptyMessage = "No open positions. Find a market to trade.",
}: {
  positions: EnrichedPosition[];
  emptyMessage?: string;
}) {
  const sorted = useMemo(
    () => [...positions].sort((a, b) => b.pnl - a.pnl),
    [positions],
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted">{emptyMessage}</p>
        <Link
          href="/markets"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Browse markets
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2.5 md:hidden">
        {sorted.map((position) => (
          <LivePositionRow key={position.id} position={position} />
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
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
            {sorted.map((position) => (
              <LivePositionRow key={position.id} position={position} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
