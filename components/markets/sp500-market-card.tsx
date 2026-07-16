"use client";

import { useEffect, useState } from "react";
import type { Outcome, Sp500DynamicMarket } from "@/lib/types";
import { formatCompactUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveCents, LiveProbability, LiveStockQuote } from "@/components/markets/live-price";
import { LiveProbabilityBar } from "@/components/markets/live-probability-bar";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
import { BetModal } from "@/components/markets/bet-modal";
import { useRegisterViewedTicker } from "@/lib/live-prices";
import { getSp500Sector } from "@/lib/sp500/sectors";
import { cn } from "@/lib/utils";

export interface Sp500TickerGroup {
  ticker: string;
  sector: string;
  markets: Sp500DynamicMarket[];
  volume: number;
}

/** Per-ticker S&P 500 card: live Alpaca quote + strike rows with Yes/No betting. */
export function Sp500TickerCard({ group }: { group: Sp500TickerGroup }) {
  const registerTicker = useRegisterViewedTicker();
  const [bet, setBet] = useState<{ market: Sp500DynamicMarket; outcome: Outcome } | null>(null);
  const sector = group.sector || getSp500Sector(group.ticker);

  useEffect(() => {
    registerTicker(group.ticker);
  }, [group.ticker, registerTicker]);

  const strikes = [...group.markets].sort((a, b) => a.strikePrice - b.strikePrice);

  return (
    <>
      <Card
        className={cn(
          "group flex flex-col border-l-[3px] border-l-[#38bdf8] transition-all duration-200",
          "hover:border-edge-strong hover:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]",
        )}
      >
        <div className="flex flex-1 flex-col p-4 pb-3 sm:p-5 sm:pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral" className="font-semibold tracking-wide">
                {group.ticker}
              </Badge>
              <Badge>{sector}</Badge>
              <MarketSourceBadge source="sp500_dynamic" />
            </div>
            <span className="flex items-center gap-1 rounded-md bg-up-soft px-1.5 py-0.5 text-[10px] font-semibold text-up">
              <span className="relative flex size-1.5">
                <span className="animate-live absolute inline-flex size-full rounded-full bg-up" />
                <span className="relative inline-flex size-1.5 rounded-full bg-up" />
              </span>
              Live
            </span>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                Last price
              </p>
              <LiveStockQuote
                ticker={group.ticker}
                className="mt-1 text-3xl font-bold tracking-tight sm:text-[2rem]"
              />
            </div>
            <div className="text-right text-[11px] text-muted">
              <p>{strikes.length} strikes</p>
              <p className="mt-0.5">{formatCompactUsd(group.volume)} vol</p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              Close above strike
            </p>
            {strikes.map((market) => (
              <div
                key={market.id}
                className="rounded-lg border border-edge/70 bg-surface-2/60 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular text-foreground">
                      $
                      {market.strikePrice.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                      <span>
                        Yes{" "}
                        <LiveProbability
                          marketId={market.id}
                          initialPrice={market.yesPrice}
                          showSkeleton={false}
                          className="font-semibold text-up"
                        />
                      </span>
                      <span className="text-faint">·</span>
                      <span>
                        No{" "}
                        <span className="font-semibold text-down">
                          {Math.round((1 - market.yesPrice) * 100)}%
                        </span>
                      </span>
                      <span className="text-faint">·</span>
                      <span>{formatCompactUsd(market.volume24h || market.volume)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="up"
                      size="sm"
                      className="min-w-[4.25rem] flex-col gap-0 py-1.5"
                      onClick={() => setBet({ market, outcome: "yes" })}
                    >
                      <span className="text-[9px] font-bold uppercase">Yes</span>
                      <LiveCents
                        marketId={market.id}
                        initialPrice={market.yesPrice}
                        side="yes"
                        className="text-[11px]"
                      />
                    </Button>
                    <Button
                      variant="down"
                      size="sm"
                      className="min-w-[4.25rem] flex-col gap-0 py-1.5"
                      onClick={() => setBet({ market, outcome: "no" })}
                    >
                      <span className="text-[9px] font-bold uppercase">No</span>
                      <LiveCents
                        marketId={market.id}
                        initialPrice={market.yesPrice}
                        side="no"
                        className="text-[11px]"
                      />
                    </Button>
                  </div>
                </div>
                <LiveProbabilityBar
                  marketId={market.id}
                  initialPrice={market.yesPrice}
                  className="mt-2"
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

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
