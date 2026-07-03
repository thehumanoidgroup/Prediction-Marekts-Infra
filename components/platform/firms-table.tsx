"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FirmOverview } from "@/lib/types";
import { formatCompactUsd, formatDate, formatPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { IconSearch } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** All prop firms with key metrics and drill-down links. */
export function FirmsTable({ firms }: { firms: FirmOverview[] }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return firms;
    return firms.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.slug.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q),
    );
  }, [firms, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full sm:max-w-xs">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-faint" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search firms…"
          className="h-9 w-full rounded-lg border border-edge bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-faint outline-none transition-colors focus:border-edge-strong"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="pb-2 pr-4 font-medium">Firm</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Traders</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">24h volume</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Total volume</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Revenue</th>
              <th className="tabular pb-2 pr-4 text-right font-medium">Pass rate</th>
              <th className="pb-2 font-medium">Onboarded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((firm) => (
              <tr
                key={firm.id}
                className="border-b border-edge/60 last:border-0 hover:bg-surface-2/60"
              >
                <td className="py-3 pr-4">
                  <Link href={`/platform/firms/${firm.id}`} className="group flex items-center gap-3">
                    <span
                      className="flex size-8 items-center justify-center rounded-lg text-sm font-bold"
                      style={{
                        backgroundColor: `${firm.accent}22`,
                        color: firm.accent,
                      }}
                    >
                      {firm.logoGlyph}
                    </span>
                    <div>
                      <p className="font-medium text-foreground transition-colors group-hover:text-accent">
                        {firm.name}
                      </p>
                      <p className="text-[11px] text-faint">{firm.slug}.proppredict.com</p>
                    </div>
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <Badge tone={firm.isActive ? "up" : "neutral"}>
                    {firm.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="tabular py-3 pr-4 text-right">
                  <span className="font-medium text-foreground">{firm.traders}</span>
                  <span className="text-muted"> · {firm.activeTraders} active</span>
                </td>
                <td className="tabular py-3 pr-4 text-right text-foreground">
                  {formatCompactUsd(firm.volume24h)}
                </td>
                <td className="tabular py-3 pr-4 text-right text-muted">
                  {formatCompactUsd(firm.totalVolume)}
                </td>
                <td className="tabular py-3 pr-4 text-right font-medium text-foreground">
                  {formatCompactUsd(firm.revenue)}
                </td>
                <td
                  className={cn(
                    "tabular py-3 pr-4 text-right font-semibold",
                    firm.passRate >= 50 ? "text-up" : "text-down",
                  )}
                >
                  {formatPct(firm.passRate)}
                </td>
                <td className="py-3 text-[11px] text-muted">{formatDate(firm.onboardedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No firms match your search.</p>
        ) : null}
      </div>
    </div>
  );
}
