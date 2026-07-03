"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type MarketSource = "internal" | "polymarket";

const options: { id: MarketSource; label: string; description: string }[] = [
  { id: "internal", label: "Internal Markets", description: "PropPredict LMSR" },
  { id: "polymarket", label: "Polymarket Markets", description: "Live CLOB feed" },
];

/** Segmented control toggling between internal LMSR and Polymarket listings. */
export function MarketSourceToggle({
  className,
  value,
  onChange,
}: {
  className?: string;
  value?: MarketSource;
  onChange?: (source: MarketSource) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSource = (searchParams.get("source") as MarketSource | null) ?? "internal";
  const source = value ?? urlSource;

  const setSource = (next: MarketSource) => {
    onChange?.(next);
    if (onChange) return;

    const params = new URLSearchParams(searchParams.toString());
    if (next === "internal") params.delete("source");
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
              "relative rounded-lg px-3 py-2 text-left transition-all sm:px-4",
              active
                ? "bg-surface-3 text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <span className="block text-xs font-semibold sm:text-sm">{option.label}</span>
            <span className="mt-0.5 hidden text-[10px] text-faint sm:block">{option.description}</span>
            {option.id === "polymarket" && active ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-up live-pulse" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function useMarketSource(): MarketSource {
  const searchParams = useSearchParams();
  return (searchParams.get("source") as MarketSource | null) ?? "internal";
}
