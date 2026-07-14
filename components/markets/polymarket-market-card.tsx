/** Polymarket market card — matches internal MarketCard trading aesthetic. */

"use client";

import { useMemo, useState } from "react";
import type { PolymarketMarket } from "@/lib/types";
import {
  formatCents,
  formatCompactUsd,
  formatTimeUntil,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconClock, IconUsers } from "@/components/ui/icons";
import { Sparkline } from "@/components/ui/sparkline";
import { LiveProbability } from "@/components/markets/live-price";
import { LiveProbabilityBar } from "@/components/markets/live-probability-bar";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
import { PolymarketDetailModal } from "@/components/markets/polymarket-detail-modal";
import { cn } from "@/lib/utils";

const categoryLabels: Record<PolymarketMarket["category"], string> = {
  crypto: "Crypto",
  stocks: "Stocks",
  forex: "Forex",
  commodities: "Commodities",
  economics: "Economics",
  indices: "Indices",
  sports: "Sports",
  politics: "Politics",
};

const categoryAccent: Record<PolymarketMarket["category"], string> = {
  crypto: "border-l-[#f59e0b]",
  stocks: "border-l-[#38bdf8]",
  forex: "border-l-[#a78bfa]",
  commodities: "border-l-[#f97316]",
  economics: "border-l-[#22c55e]",
  indices: "border-l-[#ec4899]",
  sports: "border-l-[#38bdf8]",
  politics: "border-l-[#a78bfa]",
};

function outcomePrices(market: PolymarketMarket) {
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
  const up = market.change24h >= 0;

  return (
    <>
      <Card
        className={cn(
          "group relative flex flex-col border-l-[3px] transition-all duration-200",
          "hover:border-edge-strong hover:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]",
          categoryAccent[market.category],
        )}
      >
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {market.acceptingOrders ? (
            <span className="flex items-center gap-1 rounded-md bg-up-soft px-1.5 py-0.5 text-[10px] font-semibold text-up">
              <span className="h-1.5 w-1.5 rounded-full bg-up live-pulse" />
              Live
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="flex flex-1 flex-col p-4 pb-3 text-left sm:p-5 sm:pb-3"
        >
          <div className="flex flex-wrap items-center gap-1.5 pr-16">
            <MarketSourceBadge source="polymarket" />
            <Badge>{categoryLabels[market.category]}</Badge>
            {market.status === "closing_soon" ? <Badge tone="warn">Closing soon</Badge> : null}
          </div>

          <h3 className="mt-3 line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
            {market.question}
          </h3>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                YES probability
              </p>
              {market.change24h !== 0 ? (
                <span
                  className={cn(
                    "tabular rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                    up ? "bg-up-soft text-up" : "bg-down-soft text-down",
                  )}
                >
                  {up ? "+" : "−"}
                  {Math.abs(Math.round(market.change24h * 100))}¢
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <LiveProbability
                marketId={market.id}
                initialPrice={prices.yes}
                className="text-3xl font-bold tracking-tight sm:text-[2rem]"
              />
              <Sparkline
                data={market.history.slice(-30)}
                width={96}
                height={36}
                positive={up}
              />
            </div>
            <LiveProbabilityBar marketId={market.id} initialPrice={prices.yes} className="mt-3" size="sm" />
          </div>
        </button>

        <div className="border-t border-edge/60 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-10 border-up/25 bg-up-soft/30 font-semibold text-up hover:bg-up-soft/50"
              onClick={() => setDetailOpen(true)}
            >
              Yes {formatCents(prices.yes)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-10 border-down/25 bg-down-soft/30 font-semibold text-down hover:bg-down-soft/50"
              onClick={() => setDetailOpen(true)}
            >
              No {formatCents(prices.no)}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-faint">
            <span>{volume > 0 ? `${formatCompactUsd(volume)} vol` : "Volume N/A"}</span>
            <span className="flex items-center gap-1">
              <IconUsers className="text-sm" />
              {market.traders > 0 ? market.traders.toLocaleString() : "—"}
            </span>
            <span className="flex items-center gap-1">
              <IconClock className="text-sm" />
              {formatTimeUntil(market.closesAt)}
            </span>
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
      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
    >
      Open on Polymarket
    </a>
  );
}
