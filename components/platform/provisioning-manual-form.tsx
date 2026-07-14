"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountSize, PropFirmModelType } from "@/types/provisioning";

const MODEL_TYPES: PropFirmModelType[] = ["1step", "2step", "3step", "instant"];
const ACCOUNT_SIZES: AccountSize[] = ["10K", "25K", "50K", "100K", "500K", "1M", "2M"];

interface FirmOption {
  id: string;
  name: string;
}

interface ApiErrorBody {
  code?: string;
  error?: string;
  userMessage?: string;
  fields?: Array<{ path: string; message: string }>;
}

const inputClass =
  "h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm text-foreground outline-none focus:border-edge-strong";

/** Super Admin manual account provisioning with friendly error display. */
export function ProvisioningManualForm({ firms }: { firms: FirmOption[] }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [propFirmId, setPropFirmId] = useState(firms[0]?.id ?? "");
  const [traderEmail, setTraderEmail] = useState("");
  const [modelType, setModelType] = useState<PropFirmModelType>("2step");
  const [accountSize, setAccountSize] = useState<AccountSize>("100K");
  const [customRulesJson, setCustomRulesJson] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorBody | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    setSuccess(null);

    let customRules: Record<string, unknown> | undefined;
    if (customRulesJson.trim()) {
      try {
        customRules = JSON.parse(customRulesJson) as Record<string, unknown>;
      } catch {
        setError({
          code: "INVALID_JSON",
          userMessage: "Custom rules must be valid JSON.",
          fields: [{ path: "custom_rules", message: "Invalid JSON syntax" }],
        });
        setPending(false);
        return;
      }
    }

    if (!token.trim()) {
      setError({
        code: "UNAUTHORIZED",
        userMessage: "Paste a Super Admin JWT from POST /api/auth/login.",
      });
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/provisioning/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`,
        },
        body: JSON.stringify({
          propFirmId,
          traderEmail,
          modelType,
          accountSize,
          customRules,
        }),
      });

      const body = (await response.json()) as ApiErrorBody & {
        account?: { id: string; traderEmail: string };
        userMessage?: string;
      };

      if (!response.ok) {
        setError(body);
        return;
      }

      setSuccess(
        body.userMessage ??
          `Account provisioned for ${body.account?.traderEmail ?? traderEmail}.`,
      );
      setTraderEmail("");
      setCustomRulesJson("");
      router.refresh();
    } catch {
      setError({
        code: "NETWORK_ERROR",
        userMessage: "Could not reach the provisioning API. Check your connection.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Super Admin JWT</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste access_token from /api/auth/login"
          className={inputClass}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Prop firm</span>
          <select
            value={propFirmId}
            onChange={(e) => setPropFirmId(e.target.value)}
            className={inputClass}
          >
            {firms.map((firm) => (
              <option key={firm.id} value={firm.id}>
                {firm.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Trader email</span>
          <input
            type="email"
            value={traderEmail}
            onChange={(e) => setTraderEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Model type</span>
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value as PropFirmModelType)}
            className={inputClass}
          >
            {MODEL_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Account size</span>
          <select
            value={accountSize}
            onChange={(e) => setAccountSize(e.target.value as AccountSize)}
            className={inputClass}
          >
            {ACCOUNT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">
          Custom rules JSON (optional)
        </span>
        <textarea
          value={customRulesJson}
          onChange={(e) => setCustomRulesJson(e.target.value)}
          rows={3}
          placeholder='{"profitTarget": 9}'
          className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-edge-strong"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending || !propFirmId || !traderEmail}>
          {pending ? "Provisioning…" : "Provision account"}
        </Button>
      </div>

      {success ? <p className="text-sm font-medium text-up">{success}</p> : null}

      {error ? (
        <div className="rounded-lg border border-down/30 bg-down/5 p-3">
          <p className="text-sm font-semibold text-down">
            {error.userMessage ?? error.error ?? "Provisioning failed"}
          </p>
          {error.code ? (
            <p className="mt-1 text-xs text-muted">Code: {error.code}</p>
          ) : null}
          {error.fields?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
              {error.fields.map((field) => (
                <li key={field.path}>
                  <span className="font-medium text-foreground">{field.path}</span>:{" "}
                  {field.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
