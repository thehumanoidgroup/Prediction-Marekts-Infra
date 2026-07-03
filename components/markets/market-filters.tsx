"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconSearch } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const categories = [
  { id: "all", label: "All" },
  { id: "crypto", label: "Crypto" },
  { id: "stocks", label: "Stocks" },
  { id: "indices", label: "Indices" },
  { id: "forex", label: "Forex" },
  { id: "commodities", label: "Commodities" },
  { id: "economics", label: "Economics" },
];

const sorts = [
  { id: "volume", label: "Volume" },
  { id: "movers", label: "Movers" },
  { id: "closing", label: "Closing" },
];

/** Category tabs, sort toggle and debounced search, synced to the URL. */
export function MarketFilters({ hideSort = false }: { hideSort?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = searchParams.get("category") ?? "all";
  const sort = searchParams.get("sort") ?? "volume";
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const setParam = (key: string, value: string, defaultValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Debounce the search box into the URL.
  useEffect(() => {
    const handle = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (query !== current) setParam("q", query, "");
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search markets…"
            className="h-10 w-full rounded-lg border border-edge bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-edge-strong"
          />
        </div>
        {!hideSort ? (
          <div className="flex rounded-lg border border-edge bg-surface p-0.5">
            {sorts.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setParam("sort", option.id, "volume")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sort === option.id
                    ? "bg-surface-3 text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {categories.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setParam("category", option.id, "all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                category === option.id
                  ? "bg-accent-soft text-accent"
                  : "border border-edge bg-surface text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
