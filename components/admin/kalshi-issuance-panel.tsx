"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ACCOUNT_SIZES,
  MODEL_TYPES,
  type ChallengeRules,
  type ChallengeRulesInput,
  type ChallengeTemplate,
  type ModelType,
  type ProvisionResult,
} from "@/lib/account-provisioning";
import type { ChallengeTemplateView } from "@/lib/provisioning/challenge-template-defaults";
import {
  FIRM_MODEL_TYPE_LABELS,
  firmTemplateToChallengeRulesInput,
} from "@/lib/provisioning/firm-template-rules";
import { formatCompactUsd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChallengeRulesPreview } from "@/components/admin/challenge-rules-preview";
import { IconClose } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { PropFirmModelType } from "@/types/provisioning";

const inputClass =
  "h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-faint">{hint}</span> : null}
    </label>
  );
}

const PROVIDERS = [
  { id: "kalshi", label: "Kalshi", hint: "Live Kalshi prediction markets" },
  {
    id: "sp500_dynamic",
    label: "S&P 500 Dynamic Markets",
    hint: "0DTE & weekly stock strike events",
  },
  { id: "polymarket", label: "Polymarket", hint: "Polymarket CLOB markets" },
  { id: "internal", label: "Internal LMSR", hint: "PropPredict simulation markets" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

function IssuanceSuccess({
  result,
  onClose,
  onIssueAnother,
}: {
  result: ProvisionResult;
  onClose: () => void;
  onIssueAnother: () => void;
}) {
  const providerTone =
    result.provider === "kalshi"
      ? "accent"
      : result.provider === "sp500_dynamic"
        ? "neutral"
        : "up";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-up/30 bg-up-soft/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-up">Account issued successfully</p>
            <p className="mt-1 text-xs text-muted">
              {result.display_name} · {result.email}
            </p>
          </div>
          <Badge tone={providerTone}>{result.provider}</Badge>
        </div>
      </div>

      <dl className="grid gap-2 rounded-xl border border-edge bg-surface-2 p-4 text-xs sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-muted">Account ID</dt>
          <dd className="mt-1 rounded-md bg-surface px-2 py-1 font-mono text-[11px]">
            {result.account_id}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Provider</dt>
          <dd className="font-semibold">
            {result.provider === "sp500_dynamic" ? "S&P 500 Dynamic Markets" : result.provider}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Live market feed</dt>
          <dd className="font-semibold">
            {result.provider === "kalshi" && result.kalshi_live_integration_enabled
              ? "Kalshi enabled"
              : result.provider === "sp500_dynamic" || result.sp500_dynamic_enabled
                ? "S&P 500 0DTE / Weekly"
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Account size</dt>
          <dd className="tabular font-semibold">{formatCompactUsd(result.account_size)}</dd>
        </div>
        <div>
          <dt className="text-muted">Model</dt>
          <dd className="font-semibold uppercase">{result.model_type}</dd>
        </div>
        <div>
          <dt className="text-muted">Credentials email</dt>
          <dd className="font-semibold">
            {result.email_sent ? (
              <span className="text-up">Sent to trader</span>
            ) : (
              <span className="text-down">Not sent</span>
            )}
          </dd>
        </div>
        {result.email_sent ? (
          <div className="sm:col-span-2 rounded-lg border border-up/30 bg-up/10 px-3 py-2 text-sm text-up">
            A welcome email with account details, login credentials, challenge rules, and a
            Trader Dashboard link was sent to <strong>{result.email}</strong>.
          </div>
        ) : null}
        <div>
          <dt className="text-muted">New user</dt>
          <dd className="font-semibold">{result.created_user ? "Yes" : "Existing trader"}</dd>
        </div>
        {result.temporary_password ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">Temporary password</dt>
            <dd className="mt-1 rounded-md bg-surface px-2 py-1 font-mono text-sm">
              {result.temporary_password}
            </dd>
          </div>
        ) : null}
        {result.kalshi_market_tickers.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">Kalshi markets linked</dt>
            <dd className="mt-1 text-[11px] text-faint">
              {result.kalshi_market_tickers.slice(0, 5).join(", ")}
              {result.kalshi_market_tickers.length > 5 ? "…" : ""}
            </dd>
          </div>
        ) : null}
        {result.sp500_tickers && result.sp500_tickers.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">S&P 500 tickers linked</dt>
            <dd className="mt-1 text-[11px] text-faint">
              {result.sp500_tickers.slice(0, 8).join(", ")}
              {result.sp500_tickers.length > 8 ? "…" : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/traders?account=${result.account_id}`}
          className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          View TraderDemoAccount
        </Link>
        <Button variant="secondary" onClick={onIssueAnother}>
          Issue another
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** Full evaluation account issuance flow for Prop Firm Admins. */
export function KalshiIssuancePanel({
  open,
  onClose,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  onIssued?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState<ProviderId>("kalshi");
  const [accountSize, setAccountSize] = useState<number>(25_000);
  const [modelType, setModelType] = useState<ModelType>("1step");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<ChallengeTemplate[]>([]);
  const [customOpen, setCustomOpen] = useState(true);
  const [customRules, setCustomRules] = useState<ChallengeRulesInput>({});
  const [firmTemplateLoading, setFirmTemplateLoading] = useState(false);
  const [firmTemplateNote, setFirmTemplateNote] = useState<{
    label: string;
    isDefault: boolean;
  } | null>(null);
  const [loadedBetMode, setLoadedBetMode] = useState<"percent" | "fixed" | null>(null);
  const [loadedBetValue, setLoadedBetValue] = useState<number | null>(null);
  const [preview, setPreview] = useState<ChallengeRules | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const applyFirmTemplate = useCallback((template: ChallengeTemplateView, size: number) => {
    setCustomRules(firmTemplateToChallengeRulesInput(template, size));
    setCustomOpen(true);
    setLoadedBetMode(template.maxBetSizeMode);
    setLoadedBetValue(template.maxBetSizePerPick);
    const label =
      FIRM_MODEL_TYPE_LABELS[template.modelType as PropFirmModelType] ??
      template.modelType.toUpperCase();
    setFirmTemplateNote({
      label,
      isDefault: template.isDefault,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const response = await fetch(`/api/admin/accounts/templates?provider=${provider}`);
        if (response.ok) {
          setTemplates((await response.json()) as ChallengeTemplate[]);
        } else {
          setTemplates([]);
        }
      } catch {
        setTemplates([]);
      }
    })();
  }, [open, provider]);

  useEffect(() => {
    if (!open || result) return;
    if (modelType === "evaluation") return;
    // Stock-event / copy-from-template selection owns the rules until cleared.
    if (templateId) return;

    let cancelled = false;
    setFirmTemplateLoading(true);
    (async () => {
      try {
        const response = await fetch(`/api/admin/challenge-templates/${modelType}`);
        if (!response.ok) throw new Error("Failed to load template");
        const body = (await response.json()) as { template: ChallengeTemplateView };
        if (cancelled || !body.template) return;
        applyFirmTemplate(body.template, accountSize);
      } catch {
        if (!cancelled) setFirmTemplateNote(null);
      } finally {
        if (!cancelled) setFirmTemplateLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- accountSize rescale is separate
  }, [open, result, modelType, templateId, provider, applyFirmTemplate]);

  useEffect(() => {
    if (!open || result || templateId) return;
    if (loadedBetMode !== "percent" || loadedBetValue == null) return;
    const stake = Math.round((loadedBetValue / 100) * accountSize * 100) / 100;
    setCustomRules((current) => ({
      ...current,
      max_stake_per_order: stake,
      max_exposure_per_market: Math.round(stake * 2 * 100) / 100,
    }));
  }, [accountSize, loadedBetMode, loadedBetValue, open, result, templateId]);

  const previewPayload = useMemo(
    () => ({
      provider,
      account_size: accountSize,
      model_type: modelType,
      template_config_id: templateId || undefined,
      challenge_rules: Object.keys(customRules).length ? customRules : undefined,
    }),
    [provider, accountSize, modelType, templateId, customRules],
  );

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/admin/accounts/preview-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewPayload),
      });
      if (!response.ok) throw new Error("Preview failed");
      setPreview((await response.json()) as ChallengeRules);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewPayload]);

  useEffect(() => {
    if (!open || result) return;
    const timer = setTimeout(() => void loadPreview(), 300);
    return () => clearTimeout(timer);
  }, [open, result, loadPreview]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) {
      setFirmTemplateNote(null);
      setLoadedBetMode(null);
      setLoadedBetValue(null);
      return;
    }
    setModelType(template.rules.model_type as ModelType);
    setAccountSize(template.rules.account_size);
    setCustomRules({
      profit_target_pct: template.rules.profit_target_pct,
      max_daily_loss_pct: template.rules.max_daily_loss_pct,
      max_drawdown_pct: template.rules.max_drawdown_pct,
      drawdown_mode: template.rules.drawdown_mode as ChallengeRulesInput["drawdown_mode"],
      max_stake_per_order: template.rules.max_stake_per_order ?? undefined,
      max_exposure_per_market: template.rules.max_exposure_per_market ?? undefined,
      min_consistency_score: template.rules.min_consistency_score ?? undefined,
      min_trading_days: template.rules.min_trading_days,
      challenge_duration_days: template.rules.challenge_duration_days,
      profit_split_pct: template.rules.profit_split_pct,
    });
    setCustomOpen(true);
    setLoadedBetMode(null);
    setLoadedBetValue(null);
    setFirmTemplateNote({
      label: template.prop_firm_label ?? template.name,
      isDefault: false,
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
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
          template_config_id: templateId || undefined,
          challenge_rules: Object.keys(customRules).length ? customRules : undefined,
          send_credentials_email: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "Issuance failed");
      }
      setResult(data as ProvisionResult);
      onIssued?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue account");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setEmail("");
    setDisplayName("");
    setProvider("kalshi");
    setAccountSize(25_000);
    setModelType("1step");
    setTemplateId("");
    setCustomRules({});
    setCustomOpen(true);
    setFirmTemplateNote(null);
    setLoadedBetMode(null);
    setLoadedBetValue(null);
    setError(null);
  }

  if (!open) return null;

  const providerMeta = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  const issueLabel =
    provider === "sp500_dynamic"
      ? "Issue S&P 500 account"
      : provider === "kalshi"
        ? "Issue Kalshi account"
        : "Issue account";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Issue New Account"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-edge bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Issue New Account</h2>
            <p className="mt-0.5 text-xs text-muted">
              Virtual evaluation account · {providerMeta.hint}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              reset();
              onClose();
            }}
            className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <IconClose />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {result ? (
            <IssuanceSuccess
              result={result}
              onClose={() => {
                reset();
                onClose();
              }}
              onIssueAnother={reset}
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="flex flex-col gap-5 lg:col-span-3">
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
                    Trader details
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Trader email" hint="Login credentials sent here">
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        placeholder="trader@example.com"
                      />
                    </Field>
                    <Field label="Display name">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className={inputClass}
                        placeholder="Optional"
                      />
                    </Field>
                    <Field label="Account size">
                      <select
                        value={accountSize}
                        onChange={(e) => setAccountSize(Number(e.target.value))}
                        className={inputClass}
                      >
                        {ACCOUNT_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {formatCompactUsd(size)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Provider" hint={providerMeta.hint}>
                      <select
                        value={provider}
                        onChange={(e) => {
                          const next = e.target.value as ProviderId;
                          setProvider(next);
                          setTemplateId("");
                          setCustomRules({});
                        }}
                        className={inputClass}
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
                    Model type
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {MODEL_TYPES.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setModelType(model.id);
                          setTemplateId("");
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-left transition-all",
                          modelType === model.id
                            ? "border-accent/60 bg-accent-soft shadow-[inset_0_0_0_1px_rgba(34,197,94,0.12)]"
                            : "border-edge bg-surface-2 hover:border-edge-strong",
                        )}
                      >
                        <span className="block text-xs font-bold">{model.label}</span>
                        <span className="mt-0.5 block text-[10px] text-faint">{model.hint}</span>
                      </button>
                    ))}
                  </div>
                  {firmTemplateLoading ? (
                    <p className="mt-3 text-[11px] text-faint">Loading model template…</p>
                  ) : firmTemplateNote ? (
                    <p className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/50 px-3 py-2.5 text-xs leading-relaxed text-foreground">
                      Rules loaded from {firmTemplateNote.label} template
                      {firmTemplateNote.isDefault ? " (platform defaults)" : ""}. Changes
                      apply only to this account.
                    </p>
                  ) : null}
                </section>

                {templates.length > 0 ? (
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      {provider === "sp500_dynamic"
                        ? "Stock event challenge templates"
                        : "Copy from template"}
                    </h3>
                    <select
                      value={templateId}
                      onChange={(e) => applyTemplate(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">— Select template —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.prop_firm_label ?? t.name} ({t.rules.model_type})
                        </option>
                      ))}
                    </select>
                    {provider === "sp500_dynamic" ? (
                      <p className="mt-1.5 text-[10px] text-faint">
                        Templates pre-fill stake limits suited to 0DTE and weekly stock events.
                        Issued accounts open with the S&amp;P 500 Markets board.
                      </p>
                    ) : null}
                  </section>
                ) : null}

                <section>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
                      Challenge rules
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCustomOpen((v) => !v)}
                      className="text-xs font-semibold text-accent hover:underline"
                    >
                      {customOpen ? "Hide fields" : "Edit overrides"}
                    </button>
                  </div>
                  {customOpen ? (
                    <div className="grid gap-3 rounded-xl border border-edge bg-surface-2 p-4 sm:grid-cols-2">
                      {(
                        [
                          ["profit_target_pct", "Profit target %", 1, 100],
                          ["max_daily_loss_pct", "Max daily loss %", 1, 100],
                          ["max_drawdown_pct", "Max drawdown %", 1, 100],
                          ["max_stake_per_order", "Max bet / pick ($)", 1, 500_000],
                          ["max_exposure_per_market", "Max exposure / market ($)", 1, 1_000_000],
                          ["min_consistency_score", "Consistency (0–1)", 0, 1],
                          ["min_trading_days", "Min trading days", 0, 365],
                          ["challenge_duration_days", "Duration (days)", 1, 730],
                          ["profit_split_pct", "Profit split %", 1, 100],
                        ] as const
                      ).map(([key, label, min, max]) => (
                        <Field key={key} label={label}>
                          <input
                            type="number"
                            min={min}
                            max={max}
                            step={key === "min_consistency_score" ? 0.01 : 1}
                            value={
                              customRules[key as keyof ChallengeRulesInput] ?? ""
                            }
                            onChange={(e) => {
                              const val = e.target.valueAsNumber;
                              if (key === "max_stake_per_order") {
                                setLoadedBetMode(null);
                                setLoadedBetValue(null);
                              }
                              setCustomRules((r) => ({
                                ...r,
                                [key]: Number.isFinite(val) ? val : undefined,
                              }));
                            }}
                            className={inputClass}
                          />
                        </Field>
                      ))}
                      <Field label="Drawdown mode">
                        <select
                          value={customRules.drawdown_mode ?? "static"}
                          onChange={(e) =>
                            setCustomRules((r) => ({
                              ...r,
                              drawdown_mode: e.target.value as ChallengeRulesInput["drawdown_mode"],
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="static">Static</option>
                          <option value="trailing">Trailing</option>
                          <option value="absolute">Absolute</option>
                        </select>
                      </Field>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      Template rules are applied. Expand to override any field for this account
                      only.
                    </p>
                  )}
                </section>

                {error ? (
                  <p className="rounded-lg bg-down-soft px-3 py-2 text-sm text-down">{error}</p>
                ) : null}
              </div>

              <div className="lg:col-span-2">
                <ChallengeRulesPreview rules={previewLoading ? null : preview} />
                {previewLoading ? (
                  <p className="mt-2 text-center text-[11px] text-faint">Updating preview…</p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {!result ? (
          <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-4">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={submitting || !email.trim()}
              onClick={() => void submit()}
              className="min-w-[160px]"
            >
              {submitting ? "Issuing…" : issueLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Trigger + modal wrapper for evaluation account issuance. */
export function IssueKalshiAccountButton({ onIssued }: { onIssued?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="shadow-[0_0_24px_-6px_var(--tenant-accent)]"
      >
        Issue New Account
      </Button>
      <KalshiIssuancePanel
        open={open}
        onClose={() => setOpen(false)}
        onIssued={onIssued}
      />
    </>
  );
}
