"use client";

import { useState } from "react";
import type { Outcome } from "@/lib/types";
import { BetModal } from "@/components/markets/bet-modal";
import { LiveCents } from "@/components/markets/live-price";

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
          className="rounded-lg bg-up/15 py-2 text-center text-xs font-semibold text-up transition-colors hover:bg-up/25"
        >
          Yes · <LiveCents marketId={marketId} initialPrice={yesPrice} side="yes" />
        </button>
        <button
          type="button"
          onClick={() => setOpen("no")}
          className="rounded-lg bg-down/15 py-2 text-center text-xs font-semibold text-down transition-colors hover:bg-down/25"
        >
          No · <LiveCents marketId={marketId} initialPrice={yesPrice} side="no" />
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
