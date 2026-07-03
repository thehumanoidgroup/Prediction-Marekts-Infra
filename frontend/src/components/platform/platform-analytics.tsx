"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlatformAnalyticsPoint } from "@/lib/types";
import { formatCompactUsd, formatDate, formatUsd } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

function VolumeTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PlatformAnalyticsPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-edge bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <p className="text-muted">{formatDate(point.t)}</p>
      <p className="tabular mt-0.5 font-semibold text-foreground">
        {formatUsd(point.volume)} volume
      </p>
      <p className="tabular text-muted">{formatUsd(point.revenue)} revenue</p>
    </div>
  );
}

function TradersTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PlatformAnalyticsPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-edge bg-surface-2 px-3 py-2 text-xs shadow-xl">
      <p className="text-muted">{formatDate(point.t)}</p>
      <p className="tabular mt-0.5 font-semibold text-foreground">{point.traders} traders</p>
    </div>
  );
}

/** System-wide volume, revenue, and trader growth charts. */
export function PlatformAnalytics({ data }: { data: PlatformAnalyticsPoint[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Trading volume" subtitle="Daily notional across all firms · 30 days" />
        <CardBody>
          <div className="h-56 w-full sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--tenant-accent)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--tenant-accent)" stopOpacity={0} />
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
                  tickFormatter={(v: number) => formatCompactUsd(v)}
                  stroke="var(--color-faint)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip content={<VolumeTooltip />} />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="var(--tenant-accent)"
                  strokeWidth={2}
                  fill="url(#volumeFill)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Platform revenue" subtitle="2.2% take rate on volume · 30 days" />
        <CardBody>
          <div className="h-56 w-full sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                  tickFormatter={(v: number) => formatCompactUsd(v)}
                  stroke="var(--color-faint)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip content={<VolumeTooltip />} />
                <Bar
                  dataKey="revenue"
                  fill="var(--tenant-accent)"
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Active traders" subtitle="Unique accounts trading across the platform" />
        <CardBody>
          <div className="h-48 w-full sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="tradersFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-up)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--color-up)" stopOpacity={0} />
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
                  domain={["auto", "auto"]}
                  stroke="var(--color-faint)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip content={<TradersTooltip />} />
                <Area
                  type="monotone"
                  dataKey="traders"
                  stroke="var(--color-up)"
                  strokeWidth={2}
                  fill="url(#tradersFill)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
