"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantProgram } from "@/lib/tenants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const drawdownModes = [
  { id: "static", label: "Static", hint: "Fixed floor below starting balance" },
  { id: "trailing", label: "Trailing", hint: "Floor follows the equity high-water mark" },
  { id: "absolute", label: "Absolute", hint: "Explicit equity floor value" },
] as const;

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

const inputClass =
  "tabular h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 pr-10 text-sm font-medium text-foreground outline-none transition-colors focus:border-edge-strong";

/** Challenge program editor — writes to the tenant's white-label config. */
export function ChallengeForm({ program }: { program: TenantProgram }) {
  const router = useRouter();
  const [form, setForm] = useState({
    profitTargetPct: program.profitTargetPct,
    maxDailyLossPct: program.maxDailyLossPct,
    maxDrawdownPct: program.maxDrawdownPct,
    drawdownMode: program.drawdownMode,
    maxStakePerOrder: program.maxStakePerOrder,
    maxExposurePerMarket: program.maxExposurePerMarket,
    challengeDurationDays: program.challengeDurationDays,
    minTradingDays: program.minTradingDays,
    profitSplitPct: program.profitSplitPct,
    accountSizes: program.accountSizes.join(", "),
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const setNum = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.valueAsNumber }));

  async function save() {
    setPending(true);
    setMessage(null);
    const accountSizes = form.accountSizes
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (accountSizes.length === 0) {
      setMessage({ ok: false, text: "Enter at least one account size" });
      setPending(false);
      return;
    }
    try {
      const response = await fetch("/api/admin/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program: {
            profitTargetPct: form.profitTargetPct,
            maxDailyLossPct: form.maxDailyLossPct,
            maxDrawdownPct: form.maxDrawdownPct,
            drawdownMode: form.drawdownMode,
            maxStakePerOrder: form.maxStakePerOrder,
            maxExposurePerMarket: form.maxExposurePerMarket,
            challengeDurationDays: form.challengeDurationDays,
            minTradingDays: form.minTradingDays,
            profitSplitPct: form.profitSplitPct,
            accountSizes,
          },
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        setMessage({ ok: false, text: body.error ?? "Save failed" });
        return;
      }
      setMessage({ ok: true, text: "Challenge rules saved — applied to new evaluations" });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Network error — try again" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Objectives */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Objectives
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Profit target" suffix="%">
            <input
              type="number"
              min={1}
              max={100}
              value={form.profitTargetPct}
              onChange={setNum("profitTargetPct")}
              className={inputClass}
            />
          </Field>
          <Field label="Challenge duration" suffix="days">
            <input
              type="number"
              min={7}
              max={365}
              value={form.challengeDurationDays}
              onChange={setNum("challengeDurationDays")}
              className={inputClass}
            />
          </Field>
          <Field label="Min trading days" suffix="days">
            <input
              type="number"
              min={0}
              max={60}
              value={form.minTradingDays}
              onChange={setNum("minTradingDays")}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      {/* Drawdown */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Drawdown policy
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {drawdownModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setForm((f) => ({ ...f, drawdownMode: mode.id }))}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                form.drawdownMode === mode.id
                  ? "border-accent/60 bg-accent-soft"
                  : "border-edge bg-surface-2 hover:border-edge-strong",
              )}
            >
              <span
                className={cn(
                  "block text-sm font-semibold",
                  form.drawdownMode === mode.id ? "text-accent" : "text-foreground",
                )}
              >
                {mode.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{mode.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Max drawdown" suffix="%">
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxDrawdownPct}
              onChange={setNum("maxDrawdownPct")}
              className={inputClass}
            />
          </Field>
          <Field label="Max daily loss" suffix="%">
            <input
              type="number"
              min={1}
              max={25}
              value={form.maxDailyLossPct}
              onChange={setNum("maxDailyLossPct")}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      {/* Bet size limits */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Bet size limits
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Max stake per pick" suffix="USD">
            <input
              type="number"
              min={10}
              value={form.maxStakePerOrder}
              onChange={setNum("maxStakePerOrder")}
              className={inputClass}
            />
          </Field>
          <Field label="Max exposure per market" suffix="USD">
            <input
              type="number"
              min={10}
              value={form.maxExposurePerMarket}
              onChange={setNum("maxExposurePerMarket")}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      {/* Program */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Program</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account sizes (comma-separated)" suffix="USD">
            <input
              type="text"
              value={form.accountSizes}
              onChange={(event) => setForm((f) => ({ ...f, accountSizes: event.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Profit split to trader" suffix="%">
            <input
              type="number"
              min={10}
              max={100}
              value={form.profitSplitPct}
              onChange={setNum("profitSplitPct")}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save challenge rules"}
        </Button>
        {message ? (
          <p
            className={cn(
              "text-xs font-medium",
              message.ok ? "text-up" : "text-down",
            )}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
