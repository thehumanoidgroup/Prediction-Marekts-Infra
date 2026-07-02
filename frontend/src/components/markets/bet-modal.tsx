"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Outcome } from "@/lib/types";
import { useLivePrice } from "@/lib/live-prices";
import { formatCents, formatUsdPrecise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { IconClose } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const QUICK_SIZES = [100, 250, 500, 1000];

export interface BetModalProps {
  marketId: string;
  question: string;
  /** SSR fallback; the modal reprices from the live feed. */
  initialYesPrice: number;
  initialOutcome: Outcome;
  onClose: () => void;
}

/**
 * Quick bet ticket, opened from market cards. Prices tick live while the
 * modal is open; fills execute at the server's current price.
 */
export function BetModal({
  marketId,
  question,
  initialYesPrice,
  initialOutcome,
  onClose,
}: BetModalProps) {
  const router = useRouter();
  const yesPrice = useLivePrice(marketId, initialYesPrice);
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  const [shares, setShares] = useState(250);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  const price = outcome === "yes" ? yesPrice : 1 - yesPrice;
  const cost = Number.isFinite(shares) ? shares * price : 0;

  const invalid = useMemo(() => {
    if (!Number.isFinite(shares) || shares <= 0) return "Enter a share amount";
    return null;
  }, [shares]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, outcome, side: "buy", shares }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Order failed");
        return;
      }
      setPlaced(
        `Bought ${shares} ${outcome.toUpperCase()} @ ${formatCents(body.order.price)}`,
      );
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Place bet: ${question}`}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-edge bg-surface p-5 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold leading-snug">{question}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <IconClose className="text-base" />
          </button>
        </div>

        {placed ? (
          <div className="mt-5 flex flex-col gap-4">
            <p className="rounded-lg bg-up-soft px-3 py-2.5 text-sm font-medium text-up">
              {placed}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onClose}>
                Keep trading
              </Button>
              <Link
                href="/portfolio"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                View portfolio
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {/* Outcome */}
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
              <label htmlFor="bet-shares" className="mb-1.5 block text-xs font-medium text-muted">
                Shares
              </label>
              <input
                id="bet-shares"
                type="number"
                min={1}
                autoFocus
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
                <dt className="text-muted">Total cost</dt>
                <dd className="font-semibold">{formatUsdPrecise(cost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Max payout</dt>
                <dd className="font-semibold text-up">
                  {formatUsdPrecise(Number.isFinite(shares) ? shares : 0)}
                </dd>
              </div>
            </dl>

            <Button
              size="lg"
              variant={outcome === "yes" ? "up" : "down"}
              disabled={pending || invalid !== null}
              onClick={submit}
              className="w-full"
            >
              {pending ? "Placing bet…" : (invalid ?? `Buy ${outcome.toUpperCase()}`)}
            </Button>

            {error ? (
              <p className="rounded-lg bg-down-soft px-3 py-2 text-xs font-medium text-down">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
