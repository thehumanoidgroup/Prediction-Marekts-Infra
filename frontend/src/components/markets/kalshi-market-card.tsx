"use client";

import { useMemo, useState } from "react";
import type { KalshiMarket, Outcome } from "@/lib/types";
import { formatCents, formatCompactUsd, formatTimeUntil } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconClock } from "@/components/ui/icons";
import { LiveCents, LiveProbability } from "@/components/markets/live-price";
import { LiveProbabilityBar } from "@/components/markets/live-probability-bar";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
import { BetModal } from "@/components/markets/bet-modal";
import { cn } from "@/lib/utils";

const categoryLabels: Record<string, string> = {
  crypto: "Crypto",
  stocks: "Stocks",
  forex: "Forex",
  commodities: "Commodities",
  economics: "Economics",
  indices: "Indices",
  sports: "Sports",
  politics: "Politics",
};

const categoryAccent: Record<string, string> = {
  crypto: "border-l-[#f59e0b]",
  stocks: "border-l-[#38bdf8]",
  forex: "border-l-[#a78bfa]",
  commodities: "border-l-[#f97316]",
  economics: "border-l-[#22c55e]",
  indices: "border-l-[#ec4899]",
  sports: "border-l-[#ef4444]",
  politics: "border-l-[#8b5cf6]",
};

/** Kalshi market card with live prices and virtual betting. */
export function KalshiMarketCard({ market }: { market: KalshiMarket }) {
  const [betOpen, setBetOpen] = useState(false);
  const [betOutcome, setBetOutcome] = useState<Outcome>("yes");
  const volume = market.volume24h || market.volume;
  const accent = categoryAccent[market.category] ?? "border-l-accent";

  const openBet = (outcome: Outcome) => {
    setBetOutcome(outcome);
    setBetOpen(true);
  };

  return (
    <>
      <Card
        className={cn(
          "group relative flex flex-col border-l-[3px] transition-all duration-200",
          "hover:border-edge-strong hover:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]",
          accent,
        )}
      >
        <div className="flex flex-1 flex-col p-4 pb-3 sm:p-5 sm:pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge>{categoryLabels[market.category] ?? market.category}</Badge>
              <MarketSourceBadge source="kalshi" />
            </div>
            {market.acceptingOrders ? (
              <span className="flex items-center gap-1 rounded-md bg-up-soft px-1.5 py-0.5 text-[10px] font-semibold text-up">
                <span className="relative flex size-1.5">
                  <span className="animate-live absolute inline-flex size-full rounded-full bg-up" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-up" />
                </span>
                Live
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-foreground">
            {market.question}
          </h3>

          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              YES probability
            </p>
            <LiveProbability
              marketId={market.id}
              initialPrice={market.yesPrice}
              className="mt-1 text-3xl font-bold tracking-tight sm:text-[2rem]"
            />
            <div className="mt-3">
              <LiveProbabilityBar marketId={market.id} initialPrice={market.yesPrice} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>{formatCompactUsd(volume)} vol</span>
            <span className="inline-flex items-center gap-1">
              <IconClock className="text-xs" />
              {formatTimeUntil(market.closesAt)}
            </span>
          </div>
        </div>

        {market.status !== "resolved" && market.acceptingOrders ? (
          <div className="grid grid-cols-2 gap-2 border-t border-edge p-3 sm:p-4">
            <Button
              variant="up"
              size="sm"
              className="flex-col gap-0.5 py-2.5"
              onClick={() => openBet("yes")}
            >
              <span className="text-[10px] font-bold uppercase">Yes</span>
              <LiveCents marketId={market.id} initialPrice={market.yesPrice} side="yes" />
            </Button>
            <Button
              variant="down"
              size="sm"
              className="flex-col gap-0.5 py-2.5"
              onClick={() => openBet("no")}
            >
              <span className="text-[10px] font-bold uppercase">No</span>
              <LiveCents marketId={market.id} initialPrice={market.yesPrice} side="no" />
            </Button>
          </div>
        ) : null}
      </Card>

      {betOpen ? (
        <BetModal
          marketId={market.id}
          question={market.question}
          initialYesPrice={market.yesPrice}
          initialOutcome={betOutcome}
          onClose={() => setBetOpen(false)}
        />
      ) : null}
    </>
  );
}
