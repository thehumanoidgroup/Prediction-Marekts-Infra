"use client";

import Link from "next/link";
import { useState } from "react";
import type { Market, Outcome } from "@/lib/types";
import { formatCompactUsd } from "@/lib/format";
import { BetModal } from "@/components/markets/bet-modal";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
import { LiveProbability } from "@/components/markets/live-price";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

/** Compact "top movers" list with live prices and one-tap betting. */
export function MoversList({ markets }: { markets: Market[] }) {
  const [bet, setBet] = useState<{ market: Market; outcome: Outcome } | null>(null);

  return (
    <>
      <ul className="divide-y divide-edge/60">
        {markets.map((market) => {
          const up = market.change24h >= 0;
          return (
            <li key={market.id} className="py-3 first:pt-1 last:pb-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <Link
                  href={`/markets/${market.id}`}
                  className="group min-w-0 flex-1"
                >
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-accent">
                    {market.question}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <MarketSourceBadge source={market.source} compact />
                    <p className="text-[11px] text-faint">{formatCompactUsd(market.volume)} vol</p>
                  </div>
                </Link>
                <Sparkline
                  data={market.history.slice(-24)}
                  width={56}
                  height={24}
                  positive={up}
                />
                <div className="w-12 shrink-0 text-right sm:w-14">
                  <LiveProbability
                    marketId={market.id}
                    initialPrice={market.yesPrice}
                    className="text-sm font-bold"
                  />
                  <p
                    className={cn(
                      "tabular text-[10px] font-semibold",
                      up ? "text-up" : "text-down",
                    )}
                  >
                    {up ? "+" : "−"}
                    {Math.abs(Math.round(market.change24h * 100))}¢
                  </p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setBet({ market, outcome: "yes" })}
                  className="min-h-8 rounded-md border border-up/20 bg-up/10 text-[11px] font-semibold text-up transition-colors hover:bg-up/20 active:scale-[0.98]"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setBet({ market, outcome: "no" })}
                  className="min-h-8 rounded-md border border-down/20 bg-down/10 text-[11px] font-semibold text-down transition-colors hover:bg-down/20 active:scale-[0.98]"
                >
                  No
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {bet ? (
        <BetModal
          marketId={bet.market.id}
          question={bet.market.question}
          initialYesPrice={bet.market.yesPrice}
          initialOutcome={bet.outcome}
          onClose={() => setBet(null)}
        />
      ) : null}
    </>
  );
}
