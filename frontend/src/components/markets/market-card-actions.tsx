"use client";

import { useState } from "react";
import type { Outcome } from "@/lib/types";
import { BetModal } from "@/components/markets/bet-modal";
import { LiveCents } from "@/components/markets/live-price";
import { cn } from "@/lib/utils";

/** Prominent YES/NO bet buttons on a market card, opening the bet ticket. */
export function MarketCardActions({
  marketId,
  question,
  yesPrice,
}: {
  marketId: string;
  question: string;
  yesPrice: number;
}) {
  const [open, setOpen] = useState<Outcome | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen("yes")}
          className={cn(
            "flex min-h-11 flex-col items-center justify-center rounded-lg border border-up/25",
            "bg-up/10 py-2.5 text-xs font-semibold text-up",
            "transition-all active:scale-[0.98] hover:border-up/50 hover:bg-up/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-up/40",
          )}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Yes</span>
          <span className="tabular mt-0.5 text-sm font-bold">
            <LiveCents marketId={marketId} initialPrice={yesPrice} side="yes" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen("no")}
          className={cn(
            "flex min-h-11 flex-col items-center justify-center rounded-lg border border-down/25",
            "bg-down/10 py-2.5 text-xs font-semibold text-down",
            "transition-all active:scale-[0.98] hover:border-down/50 hover:bg-down/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-down/40",
          )}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">No</span>
          <span className="tabular mt-0.5 text-sm font-bold">
            <LiveCents marketId={marketId} initialPrice={yesPrice} side="no" />
          </span>
        </button>
      </div>
      {open ? (
        <BetModal
          marketId={marketId}
          question={question}
          initialYesPrice={yesPrice}
          initialOutcome={open}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
