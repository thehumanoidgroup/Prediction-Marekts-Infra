"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const ACCOUNT_SIZES = [10_000, 25_000, 50_000, 100_000] as const;
const PROVIDERS = ["internal", "kalshi", "polymarket"] as const;

/** Firm admin form to manually issue an evaluation account. */
export function ProvisionAccountForm() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("kalshi");
  const [accountSize, setAccountSize] = useState<number>(25_000);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/accounts/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          display_name: displayName || undefined,
          provider,
          account_size: accountSize,
          send_credentials_email: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "Provisioning failed");
      }
      setMessage({
        ok: true,
        text: `Account issued to ${data.email} (${data.provider}, ${data.account_size / 1000}K)${
          data.temporary_password ? " — credentials emailed" : ""
        }`,
      });
      setEmail("");
      setDisplayName("");
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Could not provision account",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-edge bg-surface-2 p-4">
      <div>
        <h3 className="text-sm font-semibold">Issue evaluation account</h3>
        <p className="text-xs text-muted">
          Provision a Kalshi or internal demo account for a new or existing trader.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-lg border border-edge bg-surface px-3 text-sm"
            placeholder="trader@example.com"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Display name (optional)</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-9 rounded-lg border border-edge bg-surface px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as (typeof PROVIDERS)[number])}
            className="h-9 rounded-lg border border-edge bg-surface px-3 text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Account size</span>
          <select
            value={accountSize}
            onChange={(e) => setAccountSize(Number(e.target.value))}
            className="h-9 rounded-lg border border-edge bg-surface px-3 text-sm"
          >
            {ACCOUNT_SIZES.map((size) => (
              <option key={size} value={size}>
                ${size / 1000}K
              </option>
            ))}
          </select>
        </label>
      </div>

      {message && (
        <p className={`text-sm ${message.ok ? "text-up" : "text-down"}`}>{message.text}</p>
      )}

      <div>
        <Button type="submit" disabled={loading}>
          {loading ? "Provisioning…" : "Issue account"}
        </Button>
      </div>
    </form>
  );
}
