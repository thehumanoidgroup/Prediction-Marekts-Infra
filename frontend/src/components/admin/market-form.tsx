"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MarketCategory } from "@/lib/types";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const categories: Array<{ id: MarketCategory; label: string }> = [
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
  { id: "indices", label: "Indices" },
  { id: "forex", label: "Forex" },
  { id: "commodities", label: "Commodities" },
  { id: "economics", label: "Economics" },
];

function defaultCloseDate(): string {
  const d = new Date(Date.now() + 30 * 24 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

/** Market template composer — new markets go live for traders instantly. */
export function MarketForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<MarketCategory>("crypto");
  const [probability, setProbability] = useState(50);
  const [closeDate, setCloseDate] = useState(defaultCloseDate());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function create() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          category,
          initialProbability: probability / 100,
          closesAt: new Date(`${closeDate}T23:59:59Z`).getTime(),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({ ok: false, text: body.error ?? "Could not create market" });
        return;
      }
      setMessage({ ok: true, text: `Market live: "${body.market.question}"` });
      setQuestion("");
      setProbability(50);
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Network error — try again" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Market question</span>
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Will BTC close above $200K on Dec 31, 2026?"
          maxLength={160}
          className="h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-edge-strong"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">Category</span>
        <div className="flex flex-wrap gap-2">
          {categories.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCategory(option.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                category === option.id
                  ? "bg-accent-soft text-accent"
                  : "border border-edge bg-surface-2 text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
            Initial YES probability
            <span className="tabular font-semibold text-foreground">{probability}%</span>
          </span>
          <input
            type="range"
            min={3}
            max={97}
            value={probability}
            onChange={(event) => setProbability(event.target.valueAsNumber)}
            className="w-full accent-[var(--tenant-accent)]"
          />
          <div className="mt-1 flex justify-between text-[11px] text-faint">
            <span className="text-up">Yes {formatCents(probability / 100)}</span>
            <span className="text-down">No {formatCents(1 - probability / 100)}</span>
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Close date</span>
          <input
            type="date"
            value={closeDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setCloseDate(event.target.value)}
            className="tabular h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors focus:border-edge-strong"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <Button onClick={create} disabled={pending || question.trim().length < 10}>
          {pending ? "Creating…" : "Create market"}
        </Button>
        {message ? (
          <p className={cn("text-xs font-medium", message.ok ? "text-up" : "text-down")}>
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
