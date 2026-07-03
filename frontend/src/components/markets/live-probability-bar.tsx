"use client";

import { useLivePrice } from "@/lib/live-prices";
import { ProbabilityBar } from "@/components/ui/probability-bar";

/** Probability bar that tracks the live YES price feed. */
export function LiveProbabilityBar({
  marketId,
  initialPrice,
  className,
  size = "sm",
}: {
  marketId: string;
  initialPrice: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const yesPrice = useLivePrice(marketId, initialPrice);
  return <ProbabilityBar yesPrice={yesPrice} className={className} size={size} />;
}
