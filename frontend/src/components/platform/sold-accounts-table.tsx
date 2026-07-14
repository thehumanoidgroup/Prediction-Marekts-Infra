"use client";

import { useEffect, useState } from "react";
import { formatCompactUsd, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

type SoldAccountRow = {
  id: string;
  created_at: string;
  tenant_slug: string | null;
  tenant_name: string | null;
  trader_demo_account_id: string | null;
  provider: string;
  issuance_source: string;
  account_size: number;
  model_type: string;
  trader_email: string;
  trader_display_name: string;
  external_order_id: string | null;
  kalshi_market_tickers: string[] | null;
  credentials_generated: boolean;
  email_sent: boolean;
};

const providerTones: Record<string, "accent" | "up" | "down"> = {
  kalshi: "accent",
  polymarket: "up",
  internal: "down",
};

/** Super Admin audit log of issued evaluation accounts. */
export function SoldAccountsTable() {
  const [rows, setRows] = useState<SoldAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/platform/sold-accounts", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load sold accounts");
        }
        const data = (await response.json()) as SoldAccountRow[];
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-muted">Loading sold accounts…</p>;
  }

  if (error) {
    return <p className="text-sm text-down">{error}</p>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">No accounts issued yet.</p>;
  }

  const providers = Array.from(new Set(rows.map((row) => row.provider))).sort();
  const filtered =
    providerFilter === "all" ? rows : rows.filter((row) => row.provider === providerFilter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Provider</span>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="h-8 rounded-lg border border-edge bg-surface-2 px-2 text-xs"
        >
          <option value="all">All</option>
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-faint">
            <th className="pb-2 pr-4 font-medium">Issued</th>
            <th className="pb-2 pr-4 font-medium">Account ID</th>
            <th className="pb-2 pr-4 font-medium">Firm</th>
            <th className="pb-2 pr-4 font-medium">Trader</th>
            <th className="pb-2 pr-4 font-medium">Provider</th>
            <th className="pb-2 pr-4 font-medium">Source</th>
            <th className="tabular pb-2 pr-4 text-right font-medium">Size</th>
            <th className="pb-2 pr-4 font-medium">Model</th>
            <th className="pb-2 pr-4 font-medium">Kalshi markets</th>
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 font-medium">Order</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-edge/60 last:border-0 hover:bg-surface-2/60">
              <td className="py-3 pr-4 text-muted">{formatDate(row.created_at)}</td>
              <td className="py-3 pr-4 font-mono text-[11px] text-faint">
                {row.trader_demo_account_id ?? "—"}
              </td>
              <td className="py-3 pr-4">
                <div className="font-medium">{row.tenant_name ?? "—"}</div>
                <div className="text-xs text-faint">{row.tenant_slug}</div>
              </td>
              <td className="py-3 pr-4">
                <div className="font-medium">{row.trader_display_name}</div>
                <div className="text-xs text-faint">{row.trader_email}</div>
              </td>
              <td className="py-3 pr-4">
                <Badge tone={providerTones[row.provider] ?? "accent"}>{row.provider}</Badge>
              </td>
              <td className="py-3 pr-4 capitalize text-muted">{row.issuance_source}</td>
              <td className="tabular py-3 pr-4 text-right">{formatCompactUsd(row.account_size)}</td>
              <td className="py-3 pr-4 text-muted">{row.model_type}</td>
              <td className="py-3 pr-4 text-xs text-faint">
                {row.kalshi_market_tickers?.length
                  ? `${row.kalshi_market_tickers.length} linked`
                  : "—"}
              </td>
              <td className="py-3 pr-4">
                {row.email_sent ? (
                  <Badge tone="up">Sent</Badge>
                ) : row.credentials_generated ? (
                  <Badge tone="accent">Creds</Badge>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className="py-3 text-xs text-faint">{row.external_order_id ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
