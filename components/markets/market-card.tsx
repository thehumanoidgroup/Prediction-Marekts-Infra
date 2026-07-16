"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { Market } from "@/lib/types";
import { formatCompactUsd, formatTimeUntil } from "@/lib/format";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconClock, IconUsers } from "@/components/ui/icons";
import { Sparkline } from "@/components/ui/sparkline";
import { LiveProbability, LiveStockQuote } from "@/components/markets/live-price";
import { LiveProbabilityBar } from "@/components/markets/live-probability-bar";
import { MarketCardActions } from "@/components/markets/market-card-actions";
import { useRegisterViewedTicker } from "@/lib/live-prices";
import { cn } from "@/lib/utils";

const categoryLabels: Record<Market["category"], string> = {
  crypto: "Crypto",
  stocks: "Stocks",
  forex: "Forex",
  commodities: "Commodities",
  economics: "Economics",
  indices: "Indices",
  sports: "Sports",
  politics: "Politics",
};

const categoryAccent: Record<Market["category"], string> = {
  crypto: "border-l-[#f59e0b]",
  stocks: "border-l-[#38bdf8]",
  forex: "border-l-[#a78bfa]",
  commodities: "border-l-[#f97316]",
  economics: "border-l-[#22c55e]",
  indices: "border-l-[#ec4899]",
  sports: "border-l-[#38bdf8]",
  politics: "border-l-[#a78bfa]",
};

export function MarketCard({ market }: { market: Market }) {
  const up = market.change24h >= 0;
  const registerTicker = useRegisterViewedTicker();
  const isSp500 = market.source === "sp500_dynamic";
  const ticker = market.stockTicker;

  useEffect(() => {
    if (isSp500 && ticker) registerTicker(ticker);
  }, [isSp500, ticker, registerTicker]);

  return (
    <Card
      className={cn(
        "group flex flex-col border-l-[3px] transition-all duration-200",
        "hover:border-edge-strong hover:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]",
        categoryAccent[market.category],
      )}
    >
      <Link href={`/markets/${market.id}`} className="flex flex-1 flex-col p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{categoryLabels[market.category]}</Badge>
            <MarketSourceBadge source={market.source} compact />
            {isSp500 && ticker ? (
              <Badge tone="neutral" className="font-semibold tracking-wide">
                {ticker}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {market.status === "closing_soon" ? <Badge tone="warn">Closing soon</Badge> : null}
            <span
              className={cn(
                "tabular rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                up ? "bg-up-soft text-up" : "bg-down-soft text-down",
              )}
            >
              {up ? "+" : "−"}
              {Math.abs(Math.round(market.change24h * 100))}¢
            </span>
          </div>
        </div>

        <h3 className="mt-3 line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
          {market.question}
        </h3>

        <div className="mt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                YES probability
              </p>
              <LiveProbability
                marketId={market.id}
                initialPrice={market.yesPrice}
                className="mt-1 text-3xl font-bold tracking-tight sm:text-[2rem]"
              />
            </div>
            {isSp500 && ticker ? (
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                  {ticker} last
                </p>
                <LiveStockQuote
                  ticker={ticker}
                  className="mt-1 text-xl font-semibold tracking-tight text-foreground"
                />
                {market.strikePrice != null ? (
                  <p className="mt-0.5 text-[11px] text-muted">
                    Strike $
                    {market.strikePrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <Sparkline
                data={market.history.slice(-30)}
                width={96}
                height={36}
                positive={up}
              />
            )}
          </div>
          <LiveProbabilityBar marketId={market.id} initialPrice={market.yesPrice} className="mt-3" size="sm" />
        </div>
      </Link>

      <div className="border-t border-edge/60 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        <MarketCardActions
          marketId={market.id}
          question={market.question}
          yesPrice={market.yesPrice}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-faint">
          <span>{formatCompactUsd(market.volume)} vol</span>
          <span className="flex items-center gap-1">
            <IconUsers className="text-sm" />
            {market.traders.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <IconClock className="text-sm" />
            {formatTimeUntil(market.closesAt)}
          </span>
        </div>
      </div>
    </Card>
  );
}
