"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_ACCOUNT_SIZES,
  ALL_MODEL_TYPES,
  DEFAULT_ALLOWED_OVERRIDE_FIELDS,
  type ModelDefaultsMap,
  type ModelTypeDefaults,
  type PropFirmSettingsRecord,
} from "@/types/firm-settings";
import type { AccountSize, PropFirmModelType } from "@/types/provisioning";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODEL_LABELS: Record<PropFirmModelType, string> = {
  "1step": "1-Step",
  "2step": "2-Step",
  "3step": "3-Step",
  instant: "Instant",
};

const OVERRIDE_LABELS: Record<string, string> = {
  profitTarget: "Profit target",
  dailyDrawdown: "Daily drawdown",
  maxDrawdown: "Max drawdown",
  maxBetSizeValue: "Max bet size",
  maxBetSizeMode: "Max bet mode",
  consistencyScore: "Consistency score",
  minTradingDays: "Min trading days",
  challengeDurationDays: "Challenge duration",
  maxStakePerOrder: "Max stake per order",
  maxExposurePerMarket: "Max exposure per market",
  drawdownMode: "Drawdown mode",
  profitSplitPct: "Profit split",
};

const inputClass =
  "tabular h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-edge-strong";

function emptyModelDefaults(): ModelDefaultsMap {
  return {
    "1step": {},
    "2step": {},
    "3step": {},
    instant: {},
  };
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
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

/** Prop firm provisioning defaults — per-model rules, sizes, override policy. */
export function ProvisioningSettingsForm({
  settings,
}: {
  settings: PropFirmSettingsRecord;
}) {
  const router = useRouter();
  const [activeModel, setActiveModel] = useState<PropFirmModelType>("2step");
  const [allowedModelTypes, setAllowedModelTypes] = useState<PropFirmModelType[]>(
    settings.allowedModelTypes,
  );
  const [allowedAccountSizes, setAllowedAccountSizes] = useState<AccountSize[]>(
    settings.allowedAccountSizes,
  );
  const [modelDefaults, setModelDefaults] = useState<ModelDefaultsMap>({
    ...emptyModelDefaults(),
    ...settings.modelDefaults,
  });
  const [allowedOverrideFields, setAllowedOverrideFields] = useState<string[]>(
    settings.allowedOverrideFields,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const activeDefaults = useMemo(
    () => modelDefaults[activeModel] ?? {},
    [modelDefaults, activeModel],
  );

  function toggleModelType(modelType: PropFirmModelType) {
    setAllowedModelTypes((current) =>
      current.includes(modelType)
        ? current.filter((m) => m !== modelType)
        : [...current, modelType],
    );
  }

  function toggleAccountSize(size: AccountSize) {
    setAllowedAccountSizes((current) =>
      current.includes(size) ? current.filter((s) => s !== size) : [...current, size],
    );
  }

  function toggleOverrideField(field: string) {
    setAllowedOverrideFields((current) =>
      current.includes(field) ? current.filter((f) => f !== field) : [...current, field],
    );
  }

  function setModelField<K extends keyof ModelTypeDefaults>(
    key: K,
    value: ModelTypeDefaults[K] | undefined,
  ) {
    setModelDefaults((current) => ({
      ...current,
      [activeModel]: {
        ...current[activeModel],
        [key]: value,
      },
    }));
  }

  async function save() {
    setPending(true);
    setMessage(null);

    if (allowedModelTypes.length === 0 || allowedAccountSizes.length === 0) {
      setMessage({ ok: false, text: "Select at least one model type and account size" });
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/provisioning-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedModelTypes,
          allowedAccountSizes,
          modelDefaults,
          allowedOverrideFields,
        }),
      });

      if (!response.ok) {
        const body = await response.json();
        setMessage({ ok: false, text: body.error ?? "Save failed" });
        return;
      }

      setMessage({ ok: true, text: "Provisioning defaults saved" });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Network error — try again" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Allowed model types
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_MODEL_TYPES.map((modelType) => (
            <button
              key={modelType}
              type="button"
              onClick={() => toggleModelType(modelType)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                allowedModelTypes.includes(modelType)
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-edge bg-surface-2 text-muted hover:border-edge-strong",
              )}
            >
              {MODEL_LABELS[modelType]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Allowed account sizes
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_ACCOUNT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => toggleAccountSize(size)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                allowedAccountSizes.includes(size)
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-edge bg-surface-2 text-muted hover:border-edge-strong",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Default rules per model
        </h3>
        <div className="mb-3 flex flex-wrap gap-2 border-b border-edge pb-3">
          {ALL_MODEL_TYPES.map((modelType) => (
            <button
              key={modelType}
              type="button"
              onClick={() => setActiveModel(modelType)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                activeModel === modelType
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:text-foreground",
              )}
            >
              {MODEL_LABELS[modelType]}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Profit target" suffix="%">
            <input
              type="number"
              min={1}
              max={100}
              value={activeDefaults.profitTarget ?? ""}
              onChange={(e) =>
                setModelField(
                  "profitTarget",
                  e.target.value === "" ? undefined : e.target.valueAsNumber,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Daily drawdown" suffix="%">
            <input
              type="number"
              min={1}
              max={50}
              value={activeDefaults.dailyDrawdown ?? ""}
              onChange={(e) =>
                setModelField(
                  "dailyDrawdown",
                  e.target.value === "" ? undefined : e.target.valueAsNumber,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Max drawdown" suffix="%">
            <input
              type="number"
              min={1}
              max={50}
              value={activeDefaults.maxDrawdown ?? ""}
              onChange={(e) =>
                setModelField(
                  "maxDrawdown",
                  e.target.value === "" ? undefined : e.target.valueAsNumber,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Max bet size" suffix="%">
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={activeDefaults.maxBetSizeValue ?? ""}
              onChange={(e) =>
                setModelField(
                  "maxBetSizeValue",
                  e.target.value === "" ? undefined : e.target.valueAsNumber,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Min trading days" suffix="days">
            <input
              type="number"
              min={0}
              max={60}
              value={activeDefaults.minTradingDays ?? ""}
              onChange={(e) =>
                setModelField(
                  "minTradingDays",
                  e.target.value === "" ? undefined : e.target.valueAsNumber,
                )
              }
              className={inputClass}
            />
          </Field>
          <Field label="Challenge duration" suffix="days">
            <input
              type="number"
              min={1}
              max={365}
              value={activeDefaults.challengeDurationDays ?? ""}
              onChange={(e) =>
                setModelField(
                  "challengeDurationDays",
                  e.target.value === "" ? undefined : e.target.valueAsNumber,
                )
              }
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">
          Purchaser override fields
        </h3>
        <p className="mb-3 text-xs text-muted">
          Custom rule keys allowed in webhook `custom_rules` when selling accounts.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEFAULT_ALLOWED_OVERRIDE_FIELDS.map((field) => (
            <label
              key={field}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                allowedOverrideFields.includes(field)
                  ? "border-accent/50 bg-accent-soft/50"
                  : "border-edge bg-surface-2",
              )}
            >
              <input
                type="checkbox"
                checked={allowedOverrideFields.includes(field)}
                onChange={() => toggleOverrideField(field)}
                className="size-4 accent-accent"
              />
              <span>{OVERRIDE_LABELS[field] ?? field}</span>
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save provisioning defaults"}
        </Button>
        {message ? (
          <p className={cn("text-xs font-medium", message.ok ? "text-up" : "text-down")}>
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
