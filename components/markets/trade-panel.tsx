"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { notifyPortfolioRefresh } from "@/hooks/use-dashboard-data";
import type { Outcome } from "@/lib/types";
import { useLivePrice } from "@/lib/live-prices";
import { formatCents, formatUsdPrecise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const QUICK_SIZES = [100, 250, 500, 1000];

/**
 * Order ticket. Reprices from the live feed while open; fills market
 * orders via `POST /api/orders` and refreshes server components.
 */
export function TradePanel({
  marketId,
  yesPrice: initialYesPrice,
  balance,
  disabled,
}: {
  marketId: string;
  yesPrice: number;
  balance: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const yesPrice = useLivePrice(marketId, initialYesPrice);
  const [outcome, setOutcome] = useState<Outcome>("yes");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState(250);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "up" | "down"; text: string } | null>(null);

  const price = outcome === "yes" ? yesPrice : 1 - yesPrice;
  const cost = shares * price;
  const maxPayout = shares * 1;

  const invalid = useMemo(() => {
    if (!Number.isFinite(shares) || shares <= 0) return "Enter a share amount";
    if (side === "buy" && cost > balance) return "Insufficient balance";
    return null;
  }, [shares, side, cost, balance]);

  async function submit() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, outcome, side, shares }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({ tone: "down", text: body.error ?? "Order failed" });
        return;
      }
      setMessage({
        tone: "up",
        text: `Filled ${side} ${shares} ${outcome.toUpperCase()} @ ${formatCents(price)}`,
      });
      notifyPortfolioRefresh();
      router.refresh();
    } catch {
      setMessage({ tone: "down", text: "Network error — try again" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Buy / Sell */}
      <div className="grid grid-cols-2 rounded-lg border border-edge bg-surface-2 p-0.5">
        {(["buy", "sell"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSide(option)}
            className={cn(
              "rounded-md py-1.5 text-xs font-semibold capitalize transition-colors",
              side === option ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {/* Yes / No */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOutcome("yes")}
          className={cn(
            "rounded-lg border py-3 text-center transition-colors",
            outcome === "yes"
              ? "border-up/60 bg-up/15 text-up"
              : "border-edge bg-surface-2 text-muted hover:border-edge-strong",
          )}
        >
          <span className="block text-xs font-semibold">YES</span>
          <span className="tabular block text-lg font-bold">{formatCents(yesPrice)}</span>
        </button>
        <button
          type="button"
          onClick={() => setOutcome("no")}
          className={cn(
            "rounded-lg border py-3 text-center transition-colors",
            outcome === "no"
              ? "border-down/60 bg-down/15 text-down"
              : "border-edge bg-surface-2 text-muted hover:border-edge-strong",
          )}
        >
          <span className="block text-xs font-semibold">NO</span>
          <span className="tabular block text-lg font-bold">{formatCents(1 - yesPrice)}</span>
        </button>
      </div>

      {/* Shares */}
      <div>
        <label htmlFor="shares" className="mb-1.5 block text-xs font-medium text-muted">
          Shares
        </label>
        <input
          id="shares"
          type="number"
          min={1}
          value={Number.isFinite(shares) ? shares : ""}
          onChange={(event) => setShares(event.target.valueAsNumber)}
          className="tabular h-11 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm font-semibold text-foreground outline-none transition-colors focus:border-edge-strong"
        />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {QUICK_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setShares(size)}
              className={cn(
                "rounded-md border py-1 text-[11px] font-medium transition-colors",
                shares === size
                  ? "border-edge-strong bg-surface-3 text-foreground"
                  : "border-edge bg-surface-2 text-muted hover:text-foreground",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <dl className="tabular space-y-1.5 rounded-lg bg-surface-2 p-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">Price per share</dt>
          <dd className="font-semibold">{formatCents(price)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{side === "buy" ? "Total cost" : "Total credit"}</dt>
          <dd className="font-semibold">{formatUsdPrecise(Number.isFinite(cost) ? cost : 0)}</dd>
        </div>
        {side === "buy" ? (
          <div className="flex justify-between">
            <dt className="text-muted">Max payout</dt>
            <dd className="font-semibold text-up">
              {formatUsdPrecise(Number.isFinite(maxPayout) ? maxPayout : 0)}
            </dd>
          </div>
        ) : null}
      </dl>

      <Button
        size="lg"
        variant={outcome === "yes" ? "up" : "down"}
        disabled={disabled || pending || invalid !== null}
        onClick={submit}
        className="w-full"
      >
        {pending
          ? "Placing order…"
          : (invalid ?? `${side === "buy" ? "Buy" : "Sell"} ${outcome.toUpperCase()}`)}
      </Button>

      {message ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-xs font-medium",
            message.tone === "up" ? "bg-up-soft text-up" : "bg-down-soft text-down",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
