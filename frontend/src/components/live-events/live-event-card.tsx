"use client";

import Link from "next/link";
import type { LiveEvent } from "@/lib/types";
import { formatCompactUsd } from "@/lib/format";
import { useLiveEventView } from "@/lib/hooks/use-live-event-view";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LiveProbability } from "@/components/markets/live-price";
import { LiveProbabilityBar } from "@/components/markets/live-probability-bar";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
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

export function LiveEventCard({ event }: { event: LiveEvent }) {
  useLiveEventView(event);

  const up = event.change24h >= 0;
  const href =
    event.source === "polymarket"
      ? `/markets/${event.externalId}?source=polymarket`
      : `/markets/${event.externalId}`;
  const accent = categoryAccent[event.category] ?? "border-l-accent";

  return (
    <Card
      className={cn(
        "group flex flex-col border-l-[3px] transition-all duration-200",
        "hover:border-edge-strong hover:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]",
        accent,
      )}
    >
      <Link href={href} className="flex flex-1 flex-col p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{categoryLabels[event.category] ?? event.category}</Badge>
            <MarketSourceBadge source={event.source} />
          </div>
          <div className="flex items-center gap-1.5">
            {event.status === "closing_soon" ? <Badge tone="warn">Closing soon</Badge> : null}
            {event.status === "resolved" ? <Badge tone="down">Ended</Badge> : null}
            <span
              className={cn(
                "tabular rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                up ? "bg-up-soft text-up" : "bg-down-soft text-down",
              )}
            >
              {up ? "+" : "−"}
              {Math.abs(Math.round(event.change24h * 100))}¢
            </span>
          </div>
        </div>

        <h3 className="mt-3 line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
          {event.question}
        </h3>

        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
            YES probability
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <LiveProbability
              marketId={event.externalId}
              initialPrice={event.yesPrice}
              className="text-3xl font-bold tracking-tight sm:text-[2rem]"
            />
          </div>
          <div className="mt-3">
            <LiveProbabilityBar marketId={event.externalId} initialPrice={event.yesPrice} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>{formatCompactUsd(event.volume)} vol</span>
          <span>{formatCompactUsd(event.volume24h)} 24h</span>
        </div>
      </Link>
    </Card>
  );
}
