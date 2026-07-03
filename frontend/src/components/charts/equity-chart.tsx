"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@/lib/types";
import {
  formatCompactUsd,
  formatDate,
  formatSignedUsd,
  formatUsd,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/** Account equity curve — the centerpiece of the trader dashboard. */
export function EquityChart({
  data,
  baseline,
  profitTarget,
  currentEquity,
  totalPnl,
}: {
  data: PricePoint[];
  /** Starting balance, rendered as a dashed reference line. */
  baseline: number;
  /** Optional profit target line. */
  profitTarget?: number;
  /** Current equity for the overlay badge. */
  currentEquity?: number;
  totalPnl?: number;
}) {
  const gradientId = useId().replace(/:/g, "");
  const positive = data.length > 0 && data[data.length - 1].p >= baseline;
  const stroke = positive ? "var(--color-up)" : "var(--color-down)";
  const equity = currentEquity ?? (data.length ? data[data.length - 1].p : baseline);
  const pnl = totalPnl ?? equity - baseline;

  const yDomain = useMemo(() => {
    const values = data.map((d) => d.p);
    if (profitTarget) values.push(profitTarget);
    values.push(baseline);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || baseline * 0.02;
    return [min - pad, max + pad];
  }, [data, baseline, profitTarget]);

  return (
    <div className="relative">
      {/* Equity overlay */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col gap-0.5 sm:left-1">
        <p className="tabular text-2xl font-bold tracking-tight sm:text-3xl">
          {formatUsd(equity)}
        </p>
        <p className={cn("tabular text-sm font-semibold", pnl >= 0 ? "text-up" : "text-down")}>
          {formatSignedUsd(pnl)} total
        </p>
      </div>

      <div className="h-56 w-full pt-14 sm:h-72 sm:pt-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-edge)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(t: number) =>
                new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
              stroke="var(--color-faint)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              dy={4}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v: number) => formatCompactUsd(v)}
              stroke="var(--color-faint)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as PricePoint;
                const delta = point.p - baseline;
                return (
                  <div className="rounded-lg border border-edge bg-surface-2 px-3 py-2 text-xs shadow-xl">
                    <p className="text-muted">{formatDate(point.t)}</p>
                    <p className="tabular mt-0.5 font-semibold text-foreground">
                      {formatUsd(point.p)}
                    </p>
                    <p
                      className={cn(
                        "tabular mt-0.5 font-medium",
                        delta >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {formatSignedUsd(delta)} vs start
                    </p>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={baseline}
              stroke="var(--color-faint)"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: "Start",
                position: "insideTopRight",
                fill: "var(--color-faint)",
                fontSize: 10,
              }}
            />
            {profitTarget ? (
              <ReferenceLine
                y={profitTarget}
                stroke="var(--color-accent)"
                strokeDasharray="4 4"
                strokeOpacity={0.7}
                label={{
                  value: "Target",
                  position: "insideTopRight",
                  fill: "var(--color-accent)",
                  fontSize: 10,
                }}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="p"
              stroke={stroke}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: stroke }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
