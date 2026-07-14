"use client";

import { useEffect, useState } from "react";
import type { OrderRiskPreview, Outcome } from "@/lib/types";

export function useOrderRiskPreview({
  marketId,
  outcome,
  side,
  shares,
  yesPrice,
  enabled = true,
}: {
  marketId: string;
  outcome: Outcome;
  side: "buy" | "sell";
  shares: number;
  yesPrice: number;
  enabled?: boolean;
}) {
  const [preview, setPreview] = useState<OrderRiskPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !Number.isFinite(shares) || shares <= 0) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/orders/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            marketId,
            outcome,
            side,
            shares,
            yesPrice,
          }),
        });
        const data = await response.json();
        if (!cancelled) {
          setPreview(response.ok ? (data.preview as OrderRiskPreview) : null);
        }
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [marketId, outcome, side, shares, yesPrice, enabled]);

  return { preview, loading };
}
