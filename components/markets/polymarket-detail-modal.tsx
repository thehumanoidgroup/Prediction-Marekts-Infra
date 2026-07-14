"use client";

import { useEffect } from "react";
import type { PolymarketMarket } from "@/lib/types";
import { formatCents, formatCompactUsd, formatDate, formatTimeUntil } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconClose } from "@/components/ui/icons";
import { PolymarketExternalLink } from "@/components/markets/polymarket-market-card";
import { cn } from "@/lib/utils";

export function PolymarketDetailModal({
  market,
  open,
  onClose,
}: {
  market: PolymarketMarket;
  open: boolean;
  onClose: () => void;
}) {
  const volume = market.volume24h || market.volume;
  const outcomes = market.outcomes ?? [];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Polymarket market: ${market.question}`}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-edge bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge-strong sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Market details</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <IconClose className="text-base" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[#6366f1]/15 text-[#a5b4fc]">Polymarket</Badge>
            <Badge>{market.category}</Badge>
            {market.status === "closing_soon" ? <Badge tone="warn">Closing soon</Badge> : null}
            {market.status === "resolved" ? <Badge tone="neutral">Resolved</Badge> : null}
          </div>

          <p className="text-sm font-semibold leading-snug text-foreground">{market.question}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {outcomes.length > 0 ? (
              outcomes.map((outcome) => (
                <div
                  key={`${outcome.tokenId}-${outcome.label}`}
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    outcome.winner
                      ? "border-accent/40 bg-accent-soft/30"
                      : "border-edge bg-surface-2",
                  )}
                >
                  <p className="text-xs font-medium text-muted">{outcome.label}</p>
                  <p className="tabular mt-1 text-xl font-bold">{formatCents(outcome.price)}</p>
                </div>
              ))
            ) : (
              <>
                <div className="rounded-lg border border-up/20 bg-up-soft/40 px-3 py-2.5">
                  <p className="text-xs font-medium text-up">Yes</p>
                  <p className="tabular mt-1 text-xl font-bold text-up">
                    {formatCents(market.yesPrice)}
                  </p>
                </div>
                <div className="rounded-lg border border-down/20 bg-down-soft/40 px-3 py-2.5">
                  <p className="text-xs font-medium text-down">No</p>
                  <p className="tabular mt-1 text-xl font-bold text-down">
                    {formatCents(1 - market.yesPrice)}
                  </p>
                </div>
              </>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] font-medium text-faint">Volume</dt>
              <dd className="tabular mt-0.5 font-semibold">
                {volume > 0 ? formatCompactUsd(volume) : "N/A"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-faint">Closes</dt>
              <dd className="mt-0.5 font-semibold">
                {formatDate(market.closesAt)} ({formatTimeUntil(market.closesAt)})
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] font-medium text-faint">Condition ID</dt>
              <dd className="mt-0.5 break-all font-mono text-xs text-muted">
                {market.externalConditionId}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
            <PolymarketExternalLink market={market} />
            <Button disabled title="Direct Polymarket trading integration coming soon">
              Place bet (coming soon)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
