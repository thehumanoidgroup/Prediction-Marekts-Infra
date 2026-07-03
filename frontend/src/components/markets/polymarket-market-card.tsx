"use client";

import { useMemo, useState } from "react";
import type { PolymarketMarket } from "@/lib/types";
import {
  formatCents,
  formatCompactUsd,
  formatDate,
  formatTimeUntil,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconClock, IconExternalLink } from "@/components/ui/icons";
import { PolymarketDetailModal } from "@/components/markets/polymarket-detail-modal";
import { cn } from "@/lib/utils";

function outcomePrices(market: PolymarketMarket): { yes: number; no: number; yesLabel: string; noLabel: string } {
  const outcomes = market.outcomes ?? [];
  const yesOutcome = outcomes.find((o) => /^(yes|y)$/i.test(o.label ?? ""));
  const noOutcome = outcomes.find((o) => /^(no|n)$/i.test(o.label ?? ""));

  if (yesOutcome && noOutcome) {
    return {
      yes: yesOutcome.price,
      no: noOutcome.price,
      yesLabel: yesOutcome.label ?? "Yes",
      noLabel: noOutcome.label ?? "No",
    };
  }

  if (outcomes.length >= 2) {
    return {
      yes: outcomes[0].price,
      no: outcomes[1].price,
      yesLabel: outcomes[0].label ?? "Outcome A",
      noLabel: outcomes[1].label ?? "Outcome B",
    };
  }

  return {
    yes: market.yesPrice,
    no: Math.max(0.03, 1 - market.yesPrice),
    yesLabel: "Yes",
    noLabel: "No",
  };
}

export function PolymarketMarketCard({ market }: { market: PolymarketMarket }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const prices = useMemo(() => outcomePrices(market), [market]);
  const volume = market.volume24h || market.volume;

  return (
    <>
      <Card
        className={cn(
          "group flex flex-col border-l-[3px] border-l-[#6366f1] transition-all duration-200",
          "hover:border-edge-strong hover:shadow-[0_8px_32px_-12px_rgba(99,102,241,0.35)]",
        )}
      >
        <div className="flex flex-1 flex-col p-4 pb-3 sm:p-5 sm:pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className="bg-[#6366f1]/15 text-[#a5b4fc]">Polymarket</Badge>
              <Badge>{market.category}</Badge>
            </div>
            {market.status === "closing_soon" ? <Badge tone="warn">Closing soon</Badge> : null}
            {market.acceptingOrders ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-up">
                <span className="h-1.5 w-1.5 rounded-full bg-up live-pulse" />
                Live
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-[#a5b4fc]">
            {market.question}
          </h3>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-up/20 bg-up-soft/40 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-up/80">
                {prices.yesLabel}
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-up">{formatCents(prices.yes)}</p>
            </div>
            <div className="rounded-lg border border-down/20 bg-down-soft/40 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-down/80">
                {prices.noLabel}
              </p>
              <p className="tabular mt-1 text-2xl font-bold text-down">{formatCents(prices.no)}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-edge/60 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setDetailOpen(true)}>
              View details
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-faint"
              disabled
              title="Polymarket order routing coming soon"
            >
              Trade (soon)
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-faint">
            <span>{volume > 0 ? `${formatCompactUsd(volume)} vol` : "Volume N/A"}</span>
            <span className="flex items-center gap-1">
              <IconClock className="text-sm" />
              {formatTimeUntil(market.closesAt)}
            </span>
            <span>{formatDate(market.closesAt)}</span>
          </div>
        </div>
      </Card>

      <PolymarketDetailModal
        market={market}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}

export function PolymarketExternalLink({ market }: { market: PolymarketMarket }) {
  if (!market.marketSlug) return null;
  return (
    <a
      href={`https://polymarket.com/event/${market.marketSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-[#a5b4fc] hover:underline"
    >
      Open on Polymarket
      <IconExternalLink className="text-sm" />
    </a>
  );
}
