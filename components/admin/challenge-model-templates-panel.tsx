"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  CHALLENGE_MODEL_TYPES,
  CHALLENGE_TEMPLATE_DEFAULTS,
  type ChallengeTemplateView,
} from "@/lib/provisioning/challenge-template-defaults";
import { cn } from "@/lib/utils";
import type { MaxBetSizeMode, PropFirmModelType } from "@/types/provisioning";

const MODEL_LABELS: Record<PropFirmModelType, string> = {
  "1step": "1-Step",
  "2step": "2-Step",
  "3step": "3-Step",
  instant: "Instant",
};

const MODEL_BLURBS: Record<PropFirmModelType, string> = {
  "1step": "Single-phase evaluation",
  "2step": "Challenge + verification",
  "3step": "Extended multi-phase path",
  instant: "Accelerated / instant funding",
};

const inputClass =
  "tabular h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-accent/50";

type FormState = {
  profitTarget: string;
  dailyDrawdown: string;
  maxDrawdown: string;
  maxBetSizePerPick: string;
  maxBetSizeMode: MaxBetSizeMode;
  consistencyScore: string;
  minTradingDays: string;
  otherRulesJson: string;
};

function templateToForm(template: ChallengeTemplateView): FormState {
  return {
    profitTarget: String(template.profitTarget),
    dailyDrawdown: String(template.dailyDrawdown),
    maxDrawdown: String(template.maxDrawdown),
    maxBetSizePerPick: String(template.maxBetSizePerPick),
    maxBetSizeMode: template.maxBetSizeMode,
    consistencyScore:
      template.consistencyScore === null || template.consistencyScore === undefined
        ? ""
        : String(template.consistencyScore),
    minTradingDays:
      template.minTradingDays === null || template.minTradingDays === undefined
        ? ""
        : String(template.minTradingDays),
    otherRulesJson: JSON.stringify(template.otherRules ?? {}, null, 2),
  };
}

function defaultsToForm(modelType: PropFirmModelType): FormState {
  const defaults = CHALLENGE_TEMPLATE_DEFAULTS[modelType];
  return templateToForm({
    id: "",
    propFirmId: "",
    modelType,
    ...defaults,
    maxBetSizeRules: null,
    createdAt: "",
    updatedAt: "",
    isDefault: true,
  });
}

function Field({
  label,
  hint,
  suffix,
  children,
}: {
  label: string;
  hint?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {hint ? <span className="text-[10px] text-faint">{hint}</span> : null}
      </span>
      <div className="relative">
        {children}
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function formatUpdatedAt(iso: string | undefined, isDefault: boolean): string {
  if (isDefault || !iso) return "Using platform defaults";
  try {
    return `Updated ${new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  } catch {
    return `Updated ${iso}`;
  }
}

function ModelTemplateCard({
  modelType,
  initial,
  active,
  onSelect,
  onSaved,
}: {
  modelType: PropFirmModelType;
  initial: ChallengeTemplateView;
  active: boolean;
  onSelect: () => void;
  onSaved: (template: ChallengeTemplateView) => void;
}) {
  const [form, setForm] = useState<FormState>(() => templateToForm(initial));
  const [meta, setMeta] = useState({
    isDefault: initial.isDefault,
    updatedAt: initial.updatedAt,
  });
  const [pending, setPending] = useState<"save" | "reset" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setForm(templateToForm(initial));
    setMeta({ isDefault: initial.isDefault, updatedAt: initial.updatedAt });
    setMessage(null);
    setJsonError(null);
  }, [initial]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function save() {
    setPending("save");
    setMessage(null);
    setJsonError(null);

    let otherRules: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(form.otherRulesJson || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("Other rules must be a JSON object");
        setPending(null);
        return;
      }
      otherRules = parsed as Record<string, unknown>;
    } catch {
      setJsonError("Invalid JSON in other rules");
      setPending(null);
      return;
    }

    const profitTarget = Number(form.profitTarget);
    const dailyDrawdown = Number(form.dailyDrawdown);
    const maxDrawdown = Number(form.maxDrawdown);
    const maxBetSizePerPick = Number(form.maxBetSizePerPick);
    const consistencyScore =
      form.consistencyScore.trim() === "" ? null : Number(form.consistencyScore);
    const minTradingDays =
      form.minTradingDays.trim() === "" ? null : Number(form.minTradingDays);

    if (
      ![profitTarget, dailyDrawdown, maxDrawdown, maxBetSizePerPick].every(
        (n) => Number.isFinite(n) && n > 0,
      )
    ) {
      setMessage({ ok: false, text: "Enter valid positive numbers for required fields" });
      setPending(null);
      return;
    }
    if (
      consistencyScore !== null &&
      (!Number.isFinite(consistencyScore) || consistencyScore < 0 || consistencyScore > 1)
    ) {
      setMessage({ ok: false, text: "Consistency score must be between 0 and 1" });
      setPending(null);
      return;
    }
    if (
      minTradingDays !== null &&
      (!Number.isFinite(minTradingDays) || minTradingDays < 0 || !Number.isInteger(minTradingDays))
    ) {
      setMessage({ ok: false, text: "Min trading days must be a whole number ≥ 0" });
      setPending(null);
      return;
    }

    try {
      const response = await fetch(`/api/admin/challenge-templates/${modelType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profitTarget,
          dailyDrawdown,
          maxDrawdown,
          maxBetSizePerPick,
          maxBetSizeMode: form.maxBetSizeMode,
          consistencyScore,
          minTradingDays,
          otherRules,
        }),
      });
      const body = (await response.json()) as {
        template?: ChallengeTemplateView;
        error?: string;
      };
      if (!response.ok || !body.template) {
        setMessage({ ok: false, text: body.error ?? "Save failed" });
        return;
      }
      setForm(templateToForm(body.template));
      setMeta({ isDefault: body.template.isDefault, updatedAt: body.template.updatedAt });
      setMessage({ ok: true, text: "Template saved" });
      onSaved(body.template);
    } catch {
      setMessage({ ok: false, text: "Network error — try again" });
    } finally {
      setPending(null);
    }
  }

  async function reset() {
    setPending("reset");
    setMessage(null);
    setJsonError(null);
    try {
      const response = await fetch(`/api/admin/challenge-templates/${modelType}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as {
        template?: ChallengeTemplateView;
        error?: string;
      };
      if (!response.ok || !body.template) {
        setMessage({ ok: false, text: body.error ?? "Reset failed" });
        return;
      }
      setForm(defaultsToForm(modelType));
      setMeta({ isDefault: true, updatedAt: "" });
      setMessage({ ok: true, text: "Reset to platform defaults" });
      onSaved(body.template);
    } catch {
      setMessage({ ok: false, text: "Network error — try again" });
    } finally {
      setPending(null);
    }
  }

  return (
    <Card
      className={cn(
        "transition-colors",
        active ? "border-accent/50 ring-1 ring-accent/30" : "hover:border-edge-strong",
      )}
    >
      <CardHeader
        title={
          <button type="button" onClick={onSelect} className="text-left">
            <span className="block">{MODEL_LABELS[modelType]}</span>
          </button>
        }
        subtitle={MODEL_BLURBS[modelType]}
        action={
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              meta.isDefault
                ? "bg-surface-3 text-faint"
                : "bg-accent-soft text-accent",
            )}
          >
            {meta.isDefault ? "Defaults" : "Custom"}
          </span>
        }
      />
      <CardBody className="space-y-4">
        <p className="text-[11px] text-faint">{formatUpdatedAt(meta.updatedAt, meta.isDefault)}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Profit target" suffix="%">
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={form.profitTarget}
              onChange={(e) => patch("profitTarget", e.target.value)}
              className={cn(inputClass, "pr-8")}
            />
          </Field>
          <Field label="Daily drawdown" suffix="%">
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={form.dailyDrawdown}
              onChange={(e) => patch("dailyDrawdown", e.target.value)}
              className={cn(inputClass, "pr-8")}
            />
          </Field>
          <Field label="Max drawdown" suffix="%">
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={form.maxDrawdown}
              onChange={(e) => patch("maxDrawdown", e.target.value)}
              className={cn(inputClass, "pr-8")}
            />
          </Field>
          <Field
            label="Max bet size per pick"
            suffix={form.maxBetSizeMode === "percent" ? "%" : "$"}
          >
            <input
              type="number"
              min={0.01}
              step={form.maxBetSizeMode === "percent" ? 0.1 : 1}
              value={form.maxBetSizePerPick}
              onChange={(e) => patch("maxBetSizePerPick", e.target.value)}
              className={cn(inputClass, "pr-8")}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["percent", "fixed"] as MaxBetSizeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => patch("maxBetSizeMode", mode)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                form.maxBetSizeMode === mode
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-edge bg-surface-2 text-muted hover:border-edge-strong",
              )}
            >
              {mode === "percent" ? "% of balance" : "Fixed USD"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Consistency score" hint="Optional · 0–1">
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              placeholder="—"
              value={form.consistencyScore}
              onChange={(e) => patch("consistencyScore", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Min trading days" hint="Optional">
            <input
              type="number"
              min={0}
              max={365}
              step={1}
              placeholder="—"
              value={form.minTradingDays}
              onChange={(e) => patch("minTradingDays", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Other rules" hint="JSON">
          <textarea
            rows={5}
            value={form.otherRulesJson}
            onChange={(e) => {
              patch("otherRulesJson", e.target.value);
              setJsonError(null);
            }}
            spellCheck={false}
            className={cn(
              inputClass,
              "h-auto min-h-[7.5rem] resize-y py-2 font-mono text-xs leading-relaxed",
              jsonError ? "border-down/60" : null,
            )}
          />
        </Field>
        {jsonError ? <p className="text-xs text-down">{jsonError}</p> : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-edge/60 pt-3">
          <Button
            type="button"
            size="sm"
            disabled={pending !== null}
            onClick={() => void save()}
          >
            {pending === "save" ? "Saving…" : "Save Template"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending !== null}
            onClick={() => void reset()}
          >
            {pending === "reset" ? "Resetting…" : "Reset to Defaults"}
          </Button>
          {message ? (
            <span
              className={cn(
                "text-xs font-medium",
                message.ok ? "text-up" : "text-down",
              )}
            >
              {message.text}
            </span>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

/** Prop Firm Admin — challenge rules templates per evaluation model type. */
export function ChallengeModelTemplatesPanel({
  initialTemplates,
}: {
  initialTemplates: ChallengeTemplateView[];
}) {
  const [templates, setTemplates] = useState<ChallengeTemplateView[]>(initialTemplates);
  const [activeModel, setActiveModel] = useState<PropFirmModelType>("1step");

  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  const byType = useMemo(() => {
    const map = new Map<PropFirmModelType, ChallengeTemplateView>();
    for (const template of templates) {
      map.set(template.modelType, template);
    }
    return map;
  }, [templates]);

  const onSaved = useCallback((template: ChallengeTemplateView) => {
    setTemplates((current) =>
      CHALLENGE_MODEL_TYPES.map(
        (modelType) =>
          modelType === template.modelType
            ? template
            : (current.find((t) => t.modelType === modelType) as ChallengeTemplateView),
      ),
    );
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-edge pb-3">
        {CHALLENGE_MODEL_TYPES.map((modelType) => {
          const row = byType.get(modelType);
          const active = activeModel === modelType;
          return (
            <button
              key={modelType}
              type="button"
              onClick={() => setActiveModel(modelType)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left transition-colors",
                active
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-edge bg-surface-2 text-muted hover:border-edge-strong hover:text-foreground",
              )}
            >
              <span className="block text-sm font-semibold">{MODEL_LABELS[modelType]}</span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide opacity-80">
                {row && !row.isDefault ? "Custom" : "Defaults"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {CHALLENGE_MODEL_TYPES.map((modelType) => {
          const template = byType.get(modelType);
          if (!template) return null;
          return (
            <div
              key={modelType}
              className={cn(
                activeModel === modelType ? "block" : "hidden xl:block",
              )}
            >
              <ModelTemplateCard
                modelType={modelType}
                initial={template}
                active={activeModel === modelType}
                onSelect={() => setActiveModel(modelType)}
                onSaved={onSaved}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
