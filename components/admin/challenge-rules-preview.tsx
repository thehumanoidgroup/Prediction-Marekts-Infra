"use client";

import { formatCompactUsd, formatPct } from "@/lib/format";
import type { ChallengeRules } from "@/lib/account-provisioning";
import { cn } from "@/lib/utils";

/** Side panel showing resolved challenge rules before issuance. */
export function ChallengeRulesPreview({
  rules,
  className,
}: {
  rules: ChallengeRules | null;
  className?: string;
}) {
  if (!rules) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-edge bg-surface-2/50 p-5 text-sm text-muted",
          className,
        )}
      >
        Configure account details to preview applied rules.
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: "Model", value: rules.model_type.toUpperCase() },
    { label: "Account size", value: formatCompactUsd(rules.account_size) },
    { label: "Profit target", value: formatPct(rules.profit_target_pct) },
    { label: "Max daily loss", value: formatPct(rules.max_daily_loss_pct) },
    { label: "Max drawdown", value: formatPct(rules.max_drawdown_pct) },
    { label: "Drawdown mode", value: rules.drawdown_mode },
    {
      label: "Max bet / pick",
      value: rules.max_stake_per_order ? formatCompactUsd(rules.max_stake_per_order) : "—",
    },
    {
      label: "Max exposure / market",
      value: rules.max_exposure_per_market
        ? formatCompactUsd(rules.max_exposure_per_market)
        : "—",
    },
    {
      label: "Consistency score",
      value:
        rules.min_consistency_score != null
          ? formatPct(rules.min_consistency_score * 100, 0)
          : "—",
    },
    { label: "Min trading days", value: String(rules.min_trading_days) },
    { label: "Duration", value: `${rules.challenge_duration_days} days` },
    { label: "Profit split", value: formatPct(rules.profit_split_pct) },
    { label: "Provider", value: rules.provider },
  ];

  return (
    <div
      className={cn(
        "rounded-xl border border-edge bg-gradient-to-b from-surface-2 to-surface p-5",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold tracking-tight">Rules preview</h4>
        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
          Kalshi
        </span>
      </div>
      <dl className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-muted">{row.label}</dt>
            <dd className="tabular font-semibold text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
