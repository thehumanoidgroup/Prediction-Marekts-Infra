"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@/lib/types";
import { formatCents, formatDateTime } from "@/lib/format";

/** Market probability chart (YES price over time). */
export function PriceChart({ data }: { data: PricePoint[] }) {
  const positive = data.length > 1 && data[data.length - 1].p >= data[0].p;
  const stroke = positive ? "var(--color-up)" : "var(--color-down)";

  return (
    <div className="h-64 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
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
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={48}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(v: number) => formatCents(v)}
            stroke="var(--color-faint)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as PricePoint;
              return (
                <div className="rounded-lg border border-edge bg-surface-2 px-3 py-2 text-xs shadow-xl">
                  <p className="text-muted">{formatDateTime(point.t)}</p>
                  <p className="tabular mt-0.5 font-semibold text-foreground">
                    YES {formatCents(point.p)}
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="p"
            stroke={stroke}
            strokeWidth={2}
            fill="url(#priceFill)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
