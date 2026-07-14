"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCompactUsd, formatDate } from "@/lib/format";
import type { FirmSoldAccount } from "@/lib/account-provisioning";
import { Badge } from "@/components/ui/badge";

/** Firm-scoped sold accounts audit table. */
export function FirmSoldAccountsTable({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<FirmSoldAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/accounts/sold", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load sold accounts");
        const data = (await response.json()) as FirmSoldAccount[];
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
  }, [refreshKey]);

  if (loading) {
    return <p className="text-sm text-muted">Loading sold accounts…</p>;
  }

  if (error) {
    return <p className="text-sm text-down">{error}</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-edge bg-surface-2/40 px-4 py-8 text-center text-sm text-muted">
        No accounts issued yet. Use the button above to issue your first Kalshi demo account.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-faint">
            <th className="pb-2 pr-4 font-medium">Issued</th>
            <th className="pb-2 pr-4 font-medium">Trader</th>
            <th className="pb-2 pr-4 font-medium">Provider</th>
            <th className="pb-2 pr-4 font-medium">Model</th>
            <th className="tabular pb-2 pr-4 text-right font-medium">Size</th>
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">Source</th>
            <th className="pb-2 font-medium">Account</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-edge/60 last:border-0 hover:bg-surface-2/50">
              <td className="py-3 pr-4 text-muted">{formatDate(row.created_at)}</td>
              <td className="py-3 pr-4">
                <div className="font-medium">{row.trader_display_name}</div>
                <div className="text-xs text-faint">{row.trader_email}</div>
              </td>
              <td className="py-3 pr-4">
                <Badge tone={row.provider === "kalshi" ? "accent" : "up"}>{row.provider}</Badge>
              </td>
              <td className="py-3 pr-4">
                <Badge tone="accent">{row.model_type}</Badge>
              </td>
              <td className="tabular py-3 pr-4 text-right">{formatCompactUsd(row.account_size)}</td>
              <td className="py-3 pr-4">
                {row.email_sent ? (
                  <Badge tone="up">Sent</Badge>
                ) : row.credentials_generated ? (
                  <Badge tone="accent">Creds</Badge>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
              <td className="py-3 pr-4 capitalize text-muted">{row.issuance_source}</td>
              <td className="py-3">
                {row.trader_demo_account_id ? (
                  <Link
                    href={`/admin/traders?account=${row.trader_demo_account_id}`}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    View account
                  </Link>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
