"use client";

import { useState } from "react";
import {
  ACCOUNT_SIZES,
  MODEL_TYPES,
  type ChallengeRulesInput,
  type ModelType,
  type ProvisionResult,
} from "@/lib/account-provisioning";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PROVIDERS = [
  { id: "internal", label: "Internal LMSR" },
  { id: "kalshi", label: "Kalshi" },
  { id: "polymarket", label: "Polymarket" },
  { id: "sp500_dynamic", label: "S&P 500 Dynamic Markets" },
] as const;

/** Firm admin form to manually issue an evaluation account. */
export function ProvisionAccountForm() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["id"]>("kalshi");
  const [accountSize, setAccountSize] = useState<number>(25_000);
  const [modelType, setModelType] = useState<ModelType>("1step");
  const [customRules, setCustomRules] = useState<ChallengeRulesInput>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/accounts/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          display_name: displayName || undefined,
          provider,
          account_size: accountSize,
          model_type: modelType,
          challenge_rules: Object.keys(customRules).length ? customRules : undefined,
          send_credentials_email: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "Provisioning failed");
      }
      setResult(data as ProvisionResult);
      setEmail("");
      setDisplayName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not provision account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-edge bg-surface-2 p-4">
      <div>
        <h3 className="text-sm font-semibold">Issue evaluation account</h3>
        <p className="text-xs text-muted">
          Provision a demo account for Kalshi, S&amp;P 500 Dynamic, Polymarket, or internal markets
          with optional challenge rule overrides.
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
            onChange={(e) => setProvider(e.target.value as (typeof PROVIDERS)[number]["id"])}
            className="h-9 rounded-lg border border-edge bg-surface px-3 text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
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
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Model type</span>
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value as ModelType)}
            className="h-9 rounded-lg border border-edge bg-surface px-3 text-sm"
          >
            {MODEL_TYPES.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Profit target % (optional)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={customRules.profit_target_pct ?? ""}
            onChange={(e) =>
              setCustomRules((rules) => ({
                ...rules,
                profit_target_pct: e.target.valueAsNumber || undefined,
              }))
            }
            className="h-9 rounded-lg border border-edge bg-surface px-3 text-sm"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-down">{error}</p> : null}

      {result ? (
        <div className="rounded-lg border border-up/30 bg-up-soft/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-up">{result.message}</span>
            <Badge tone="accent">{result.provider}</Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-muted">Account ID: {result.account_id}</p>
          {result.kalshi_live_integration_enabled ? (
            <p className="mt-1 text-xs text-muted">
              Kalshi live feed enabled ({result.kalshi_market_tickers.length} markets)
            </p>
          ) : null}
          {result.sp500_dynamic_enabled || result.provider === "sp500_dynamic" ? (
            <p className="mt-1 text-xs text-muted">
              S&amp;P 500 0DTE / Weekly markets enabled
              {result.sp500_tickers?.length ? ` (${result.sp500_tickers.length} tickers)` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={loading}>
          {loading ? "Provisioning…" : "Issue account"}
        </Button>
      </div>
    </form>
  );
}
