import Link from "next/link";
import type { Market } from "@/lib/types";
import { formatCompactUsd, formatTimeUntil } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconClock, IconUsers } from "@/components/ui/icons";
import { Sparkline } from "@/components/ui/sparkline";
import { LiveProbability } from "@/components/markets/live-price";
import { MarketCardActions } from "@/components/markets/market-card-actions";
import { cn } from "@/lib/utils";

const categoryLabels: Record<Market["category"], string> = {
  crypto: "Crypto",
  stocks: "Stocks",
  forex: "Forex",
  commodities: "Commodities",
  economics: "Economics",
  indices: "Indices",
};

export function MarketCard({ market }: { market: Market }) {
  const up = market.change24h >= 0;

  return (
    <Card className="group flex flex-col transition-colors hover:border-edge-strong">
      <Link href={`/markets/${market.id}`} className="flex flex-1 flex-col p-4 pb-0 sm:p-5 sm:pb-0">
        <div className="flex items-start justify-between gap-3">
          <Badge>{categoryLabels[market.category]}</Badge>
          {market.status === "closing_soon" ? <Badge tone="warn">Closing soon</Badge> : null}
        </div>

        <h3 className="mt-3 line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
          {market.question}
        </h3>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-faint">YES probability</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <LiveProbability
                marketId={market.id}
                initialPrice={market.yesPrice}
                className="text-2xl font-bold tracking-tight"
              />
              <span className={cn("tabular text-xs font-semibold", up ? "text-up" : "text-down")}>
                {up ? "+" : "−"}
                {Math.abs(Math.round(market.change24h * 100))}¢ 24h
              </span>
            </div>
          </div>
          <Sparkline data={market.history.slice(-30)} width={88} height={30} positive={up} />
        </div>
      </Link>

      <div className="p-4 pt-3 sm:p-5 sm:pt-3">
        <MarketCardActions
          marketId={market.id}
          question={market.question}
          yesPrice={market.yesPrice}
        />
        <div className="mt-3 flex items-center justify-between border-t border-edge pt-3 text-[11px] text-faint">
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
