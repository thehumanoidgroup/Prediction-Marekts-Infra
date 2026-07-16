"use client";

import { formatCompactUsd } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { Sp500TickerStat } from "@/lib/sp500/analytics";

/** Super Admin: most-traded S&P 500 underlying tickers. */
export function Sp500Analytics({ tickers }: { tickers: Sp500TickerStat[] }) {
  if (tickers.length === 0) {
    return (
      <Card>
        <CardHeader
          title="S&P 500 markets"
          subtitle="Most traded underlyings · volume across 0DTE & weekly events"
        />
        <CardBody>
          <p className="text-sm text-muted">No S&P 500 markets generated yet.</p>
        </CardBody>
      </Card>
    );
  }

  const maxVolume = Math.max(...tickers.map((t) => t.volume), 1);

  return (
    <Card>
      <CardHeader
        title="S&P 500 markets"
        subtitle="Most traded underlyings · volume across 0DTE & weekly events"
      />
      <CardBody>
        <ul className="flex flex-col gap-3">
          {tickers.slice(0, 8).map((row) => (
            <li key={row.ticker} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold tabular tracking-wide">{row.ticker}</span>
                  <span className="text-xs text-faint">
                    {row.markets} market{row.markets === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="tabular text-muted">{formatCompactUsd(row.volume)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-surface-3">
                <div
                  className="h-full rounded-sm bg-accent/80 transition-[width] duration-500"
                  style={{ width: `${Math.max(6, (row.volume / maxVolume) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
