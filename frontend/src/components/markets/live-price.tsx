"use client";

import { useEffect, useRef, useState } from "react";
import { useFeedStatus, useLivePrice } from "@/lib/live-prices";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

/** YES probability that ticks in real time with an up/down flash. */
export function LiveProbability({
  marketId,
  initialPrice,
  className,
}: {
  marketId: string;
  initialPrice: number;
  className?: string;
}) {
  const price = useLivePrice(marketId, initialPrice);
  const flash = useFlash(price);

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

/** Live YES/NO cent prices, used in card action buttons. */
export function LiveCents({
  marketId,
  initialPrice,
  side,
}: {
  marketId: string;
  initialPrice: number;
  side: "yes" | "no";
}) {
  const yes = useLivePrice(marketId, initialPrice);
  return <>{formatCents(side === "yes" ? yes : 1 - yes)}</>;
}

/** Topbar indicator reflecting the real-time feed state. */
export function FeedStatusDot() {
  const status = useFeedStatus();
  const label = status === "live" ? "Live prices" : status === "simulated" ? "Live (sim)" : "Connecting…";
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
