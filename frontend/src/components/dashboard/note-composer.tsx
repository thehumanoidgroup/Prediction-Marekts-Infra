"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { notifyPortfolioRefresh } from "@/lib/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

/** Quick journal note input — posts to /api/journal and refreshes. */
export function NoteComposer() {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = note.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(body.error ?? "Could not save note");
        return;
      }
      setNote("");
      notifyPortfolioRefresh();
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder="Log a thought — thesis, lesson, setup…"
          maxLength={2000}
          className="h-10 min-w-0 flex-1 rounded-lg border border-edge bg-surface-2 px-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-edge-strong"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !note.trim()}
          className={cn(
            "h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors",
            "hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>
      {error ? <p className="mt-1.5 text-xs font-medium text-down">{error}</p> : null}
    </div>
  );
}
