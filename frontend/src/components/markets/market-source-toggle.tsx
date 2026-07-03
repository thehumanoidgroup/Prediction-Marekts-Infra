"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MarketViewSource } from "@/lib/types";

const options: { id: MarketViewSource; label: string; description: string }[] = [
  { id: "all", label: "All Markets", description: "Internal + Polymarket" },
  { id: "internal", label: "Internal", description: "PropPredict LMSR" },
  { id: "polymarket", label: "Polymarket", description: "Live CLOB feed" },
];

/** Segmented control for internal, Polymarket, or hybrid market listings. */
export function MarketSourceToggle({
  className,
  value,
  onChange,
}: {
  className?: string;
  value?: MarketViewSource;
  onChange?: (source: MarketViewSource) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSource = (searchParams.get("source") as MarketViewSource | null) ?? "all";
  const source = value ?? urlSource;

  const setSource = (next: MarketViewSource) => {
    onChange?.(next);
    if (onChange) return;

    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("source");
    else params.set("source", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-edge bg-surface p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        className,
      )}
    >
      {options.map((option) => {
        const active = source === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setSource(option.id)}
            className={cn(
              "relative rounded-lg px-2.5 py-2 text-left transition-all sm:px-3",
              active
                ? "bg-surface-3 text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <span className="block text-xs font-semibold sm:text-sm">{option.label}</span>
            <span className="mt-0.5 hidden text-[10px] text-faint sm:block">{option.description}</span>
            {option.id === "polymarket" && active ? (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-up live-pulse" />
            ) : null}
            {option.id === "all" && active ? (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent live-pulse" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function useMarketSource(): MarketViewSource {
  const searchParams = useSearchParams();
  const raw = searchParams.get("source") as MarketViewSource | null;
  if (raw === "internal" || raw === "polymarket") return raw;
  return "all";
}
