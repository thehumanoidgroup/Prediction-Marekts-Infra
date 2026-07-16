"use client";

import { useEffect, useRef, useState } from "react";
import { useFeedStatus, useLivePrice, useLiveStockPrice } from "@/lib/live-prices";
import { formatCents } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** YES probability that ticks in real time with an up/down flash. */
export function LiveProbability({
  marketId,
  initialPrice,
  className,
  showSkeleton = true,
}: {
  marketId: string;
  initialPrice: number;
  className?: string;
  showSkeleton?: boolean;
}) {
  const status = useFeedStatus();
  const price = useLivePrice(marketId, initialPrice);
  const flash = useFlash(price);

  if (showSkeleton && status === "connecting") {
    return <Skeleton className={cn("inline-block h-7 w-14", className)} />;
  }

  return (
    <span
      key={flash.key}
      className={cn(
        "tabular",
        flash.direction === "up" && "animate-flash-up",
        flash.direction === "down" && "animate-flash-down",
        className,
      )}
    >
      {Math.round(price * 100)}%
    </span>
  );
}

/** Live underlying equity last price for S&P 500 dynamic market cards. */
export function LiveStockQuote({
  ticker,
  className,
}: {
  ticker: string;
  className?: string;
}) {
  const status = useFeedStatus();
  const price = useLiveStockPrice(ticker);
  const flash = useFlash(price ?? 0);

  if (price == null) {
    return (
      <span className={cn("tabular text-faint", className)}>
        {status === "connecting" ? "…" : "—"}
      </span>
    );
  }

  return (
    <span
      key={flash.key}
      className={cn(
        "tabular",
        flash.direction === "up" && "animate-flash-up",
        flash.direction === "down" && "animate-flash-down",
        className,
      )}
    >
      $
      {price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

/** Live YES/NO cent prices, used in card action buttons. */
export function LiveCents({
  marketId,
  initialPrice,
  side,
  className,
}: {
  marketId: string;
  initialPrice: number;
  side: "yes" | "no";
  className?: string;
}) {
  const status = useFeedStatus();
  const yes = useLivePrice(marketId, initialPrice);
  const flash = useFlash(yes);

  if (status === "connecting") {
    return <Skeleton className="inline-block h-3.5 w-8 align-middle" />;
  }

  return (
    <span
      key={flash.key}
      className={cn(
        "tabular",
        flash.direction === "up" && side === "yes" && "animate-flash-up",
        flash.direction === "down" && side === "yes" && "animate-flash-down",
        className,
      )}
    >
      {formatCents(side === "yes" ? yes : 1 - yes)}
    </span>
  );
}

/** Topbar indicator reflecting the real-time feed state. */
export function FeedStatusDot() {
  const status = useFeedStatus();
  const label =
    status === "live" ? "Live prices" : status === "simulated" ? "Live (sim)" : "Connecting…";
  return (
    <>
      <span className="relative flex size-2">
        <span
          className={cn(
            "animate-live absolute inline-flex size-full rounded-full",
            status === "connecting" ? "bg-warn" : "bg-up",
          )}
        />
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            status === "connecting" ? "bg-warn" : "bg-up",
          )}
        />
      </span>
      <span className="text-xs font-medium text-muted">{label}</span>
    </>
  );
}

/** Compact live indicator for modals and tickets. */
export function LiveTickBadge() {
  const status = useFeedStatus();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        status === "connecting"
          ? "bg-warn-soft text-warn"
          : "bg-up-soft text-up",
      )}
    >
      <span className="relative flex size-1.5">
        {status !== "connecting" ? (
          <span className="animate-live absolute inline-flex size-full rounded-full bg-up" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-1.5 rounded-full",
            status === "connecting" ? "bg-warn" : "bg-up",
          )}
        />
      </span>
      {status === "connecting" ? "Syncing" : "Live"}
    </span>
  );
}

function useFlash(value: number): { direction: "up" | "down" | null; key: number } {
  const previous = useRef(value);
  const [state, setState] = useState<{ direction: "up" | "down" | null; key: number }>({
    direction: null,
    key: 0,
  });

  useEffect(() => {
    if (value === previous.current) return;
    const direction = value > previous.current ? "up" : "down";
    previous.current = value;
    setState((s) => ({ direction, key: s.key + 1 }));
  }, [value]);

  return state;
}
