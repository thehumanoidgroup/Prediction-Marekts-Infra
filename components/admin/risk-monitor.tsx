"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface RiskRow {
  id: string;
  name: string;
  accountSize: number;
  equity: number;
  /** Equity level at which the account fails. */
  floor: number;
  /** Share of today's loss budget consumed, 0-100. */
  dailyLossUsedPct: number;
}

interface Alert {
  id: string;
  trader: string;
  level: "warning" | "breach";
  message: string;
  at: string;
}

function bufferPct(row: RiskRow): number {
  const budget = row.accountSize - row.floor;
  return budget > 0 ? Math.max(0, Math.min(100, ((row.equity - row.floor) / budget) * 100)) : 0;
}

/**
 * Live risk board for the firm's active accounts.
 *
 * In production this subscribes to the backend risk engine's RiskEvent
 * stream (WebSocket); the demo drifts equities client-side through the
 * same rendering path so thresholds, ordering, and alerts behave exactly
 * as they will with real data.
 */
export function RiskMonitor({ rows: initialRows }: { rows: RiskRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alerted = useRef(new Set<string>());

  useEffect(() => {
    const timer = setInterval(() => {
      setRows((current) =>
        current.map((row) => {
          if (row.equity <= row.floor) return row; // breached: frozen
          const drift = row.equity * (Math.random() - 0.5) * 0.004;
          const equity = Math.max(row.floor * 0.995, row.equity + drift);
          return { ...row, equity };
        }),
      );
    }, 2_000);
    return () => clearInterval(timer);
  }, []);

  // Emit alerts when accounts cross risk thresholds.
  useEffect(() => {
    for (const row of rows) {
      const buffer = bufferPct(row);
      const time = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      if (row.equity <= row.floor && !alerted.current.has(`${row.id}-breach`)) {
        alerted.current.add(`${row.id}-breach`);
        setAlerts((a) =>
          [
            {
              id: `${row.id}-breach`,
              trader: row.name,
              level: "breach" as const,
              message: `Drawdown floor breached at ${formatUsd(row.equity)} — account failed`,
              at: time,
            },
            ...a,
          ].slice(0, 6),
        );
      } else if (buffer < 20 && buffer > 0 && !alerted.current.has(`${row.id}-warn`)) {
        alerted.current.add(`${row.id}-warn`);
        setAlerts((a) =>
          [
            {
              id: `${row.id}-warn`,
              trader: row.name,
              level: "warning" as const,
              message: `Drawdown buffer below 20% (${formatUsd(row.equity - row.floor)} left)`,
              at: time,
            },
            ...a,
          ].slice(0, 6),
        );
      }
    }
  }, [rows]);

  const sorted = [...rows].sort((a, b) => bufferPct(a) - bufferPct(b));

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Real-time risk monitor
            <span className="relative flex size-2">
              <span className="animate-live absolute inline-flex size-full rounded-full bg-up" />
              <span className="relative inline-flex size-2 rounded-full bg-up" />
            </span>
          </span>
        }
        subtitle="Active accounts ranked by remaining drawdown buffer"
      />
      <CardBody className="grid gap-4 lg:grid-cols-2">
        {/* Accounts */}
        <ul className="flex flex-col gap-3">
          {sorted.slice(0, 6).map((row) => {
            const buffer = bufferPct(row);
            const breached = row.equity <= row.floor;
            const tone = breached || buffer < 20 ? "down" : buffer < 50 ? "warn" : "up";
            return (
              <li key={row.id} className="rounded-lg border border-edge bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{row.name}</span>
                  <span className="tabular text-xs text-muted">
                    {formatUsd(row.equity)}{" "}
                    <span className="text-faint">/ floor {formatUsd(row.floor)}</span>
                  </span>
                </div>
                <Progress value={buffer} tone={tone} className="mt-2" />
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-faint">
                    Daily loss used:{" "}
                    <span className="tabular font-medium text-muted">
                      {row.dailyLossUsedPct}%
                    </span>
                  </span>
                  {breached ? (
                    <Badge tone="down">Breached</Badge>
                  ) : (
                    <span
                      className={cn(
                        "tabular font-semibold",
                        tone === "up" && "text-up",
                        tone === "warn" && "text-warn",
                        tone === "down" && "text-down",
                      )}
                    >
                      {buffer.toFixed(0)}% buffer
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Alert feed */}
        <div className="flex flex-col">
          <p className="mb-2 text-xs font-semibold text-foreground">Alerts</p>
          {alerts.length === 0 ? (
            <p className="flex-1 rounded-lg border border-dashed border-edge px-3 py-6 text-center text-xs text-faint">
              No risk alerts. Accounts crossing a 20% buffer or breaching a floor appear here
              instantly.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs",
                    alert.level === "breach"
                      ? "border-down/40 bg-down-soft"
                      : "border-warn/40 bg-warn-soft",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-semibold",
                        alert.level === "breach" ? "text-down" : "text-warn",
                      )}
                    >
                      {alert.trader}
                    </span>
                    <span className="tabular text-[10px] text-faint">{alert.at}</span>
                  </div>
                  <p className="mt-0.5 text-muted">{alert.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
