import Link from "next/link";
import type { Market } from "@/lib/types";
import { formatCents, formatCompactUsd } from "@/lib/format";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

/** Compact "top movers" list for the dashboard side column. */
export function MoversList({ markets }: { markets: Market[] }) {
  return (
    <ul className="divide-y divide-edge/60">
      {markets.map((market) => {
        const up = market.change24h >= 0;
        return (
          <li key={market.id}>
            <Link
              href={`/markets/${market.id}`}
              className="group flex items-center gap-3 py-3 first:pt-1 last:pb-1"
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-accent">
                  {market.question}
                </p>
                <p className="mt-0.5 text-[11px] text-faint">
                  {formatCompactUsd(market.volume)} vol
                </p>
              </div>
              <Sparkline data={market.history.slice(-24)} width={64} height={24} positive={up} />
              <div className="w-14 text-right">
                <p className="tabular text-sm font-semibold">{formatCents(market.yesPrice)}</p>
                <p className={cn("tabular text-[11px] font-medium", up ? "text-up" : "text-down")}>
                  {up ? "+" : "−"}
                  {Math.abs(Math.round(market.change24h * 100))}¢
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
