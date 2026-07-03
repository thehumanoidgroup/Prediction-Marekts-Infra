"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { notifyPortfolioRefresh } from "@/hooks/use-dashboard-data";
import type { Outcome } from "@/lib/types";
import { useLivePrice } from "@/lib/live-prices";
import { formatCents, formatUsdPrecise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { IconClose } from "@/components/ui/icons";
import { LiveTickBadge } from "@/components/markets/live-price";
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

function Spinner() {
  return (
    <span
      className="inline-block size-4 animate-spin-slow rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  );
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
  const potentialProfit = Number.isFinite(shares) ? shares - cost : 0;

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
      notifyPortfolioRefresh();
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Place bet: ${question}`}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-edge bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Mobile sheet handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge-strong sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <LiveTickBadge />
            </div>
            <h2 className="line-clamp-2 text-sm font-semibold leading-snug">{question}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <IconClose className="text-base" />
          </button>
        </div>

        {placed ? (
          <div className="mt-5 flex flex-col gap-4">
            <p className="rounded-lg border border-up/30 bg-up-soft px-3 py-3 text-sm font-medium text-up">
              {placed}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={onClose}>
                Keep trading
              </Button>
              <Link
                href="/portfolio"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                View portfolio
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <ProbabilityBar yesPrice={yesPrice} />

            {/* Outcome */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutcome("yes")}
                className={cn(
                  "rounded-xl border py-3.5 text-center transition-all active:scale-[0.98]",
                  outcome === "yes"
                    ? "border-up/60 bg-up/15 text-up shadow-[inset_0_0_0_1px_rgba(34,197,94,0.15)]"
                    : "border-edge bg-surface-2 text-muted hover:border-edge-strong",
                )}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider">Yes</span>
                <span className="tabular mt-0.5 block text-xl font-bold">{formatCents(yesPrice)}</span>
              </button>
              <button
                type="button"
                onClick={() => setOutcome("no")}
                className={cn(
                  "rounded-xl border py-3.5 text-center transition-all active:scale-[0.98]",
                  outcome === "no"
                    ? "border-down/60 bg-down/15 text-down shadow-[inset_0_0_0_1px_rgba(244,63,94,0.15)]"
                    : "border-edge bg-surface-2 text-muted hover:border-edge-strong",
                )}
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider">No</span>
                <span className="tabular mt-0.5 block text-xl font-bold">
                  {formatCents(1 - yesPrice)}
                </span>
              </button>
            </div>

            {/* Shares */}
            <div>
              <label htmlFor="bet-shares" className="mb-1.5 block text-xs font-medium text-muted">
                Shares to buy
              </label>
              <input
                id="bet-shares"
                type="number"
                min={1}
                inputMode="numeric"
                autoFocus
                value={Number.isFinite(shares) ? shares : ""}
                onChange={(event) => setShares(event.target.valueAsNumber)}
                className="tabular h-12 w-full rounded-xl border border-edge bg-surface-2 px-4 text-base font-semibold text-foreground outline-none transition-colors focus:border-edge-strong"
              />
              <div className="mt-2 grid grid-cols-4 gap-2">
                {QUICK_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setShares(size)}
                    className={cn(
                      "min-h-9 rounded-lg border py-1.5 text-xs font-semibold transition-colors",
                      shares === size
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-edge bg-surface-2 text-muted hover:text-foreground",
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <dl className="tabular space-y-2 rounded-xl border border-edge bg-surface-2 p-3.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">Price per share</dt>
                <dd className="font-semibold">{formatCents(price)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total cost</dt>
                <dd className="text-sm font-bold">{formatUsdPrecise(cost)}</dd>
              </div>
              <div className="flex justify-between border-t border-edge/60 pt-2">
                <dt className="text-muted">Potential profit</dt>
                <dd className="text-sm font-bold text-up">+{formatUsdPrecise(potentialProfit)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Max payout</dt>
                <dd className="font-semibold">{formatUsdPrecise(Number.isFinite(shares) ? shares : 0)}</dd>
              </div>
            </dl>

            <Button
              size="lg"
              variant={outcome === "yes" ? "up" : "down"}
              disabled={pending || invalid !== null}
              onClick={submit}
              className="w-full rounded-xl"
            >
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Placing bet…
                </span>
              ) : (
                (invalid ?? `Buy ${outcome.toUpperCase()} · ${formatUsdPrecise(cost)}`)
              )}
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
