/** Read-only Challenge Rules by Model Type for Super Admin firm drill-down. */

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatPct, formatUsd } from "@/lib/format";
import {
  FIRM_MODEL_TYPE_LABELS,
} from "@/lib/provisioning/firm-template-rules";
import type { ChallengeTemplateView } from "@/lib/provisioning/challenge-template-defaults";
import type { PropFirmModelType } from "@/types/provisioning";

function formatUpdatedAt(template: ChallengeTemplateView): string {
  if (template.isDefault || !template.updatedAt) return "Platform defaults";
  try {
    return new Date(template.updatedAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return template.updatedAt;
  }
}

function formatBetSize(template: ChallengeTemplateView): string {
  if (template.maxBetSizeMode === "fixed") {
    return `${formatUsd(template.maxBetSizePerPick)} fixed`;
  }
  return `${formatPct(template.maxBetSizePerPick, 1)} of balance`;
}

function formatConsistency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value <= 1 ? value.toFixed(2) : formatPct(value, 0);
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-edge/50 py-2 last:border-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ModelTemplateCard({ template }: { template: ChallengeTemplateView }) {
  const label =
    FIRM_MODEL_TYPE_LABELS[template.modelType as PropFirmModelType] ??
    template.modelType;
  const otherKeys = Object.keys(template.otherRules ?? {});

  return (
    <Card className="bg-surface-2/40">
      <CardHeader
        title={label}
        subtitle={formatUpdatedAt(template)}
        action={
          <Badge tone={template.isDefault ? "neutral" : "accent"}>
            {template.isDefault ? "Defaults" : "Custom"}
          </Badge>
        }
      />
      <CardBody>
        <dl>
          <Row label="Profit target" value={formatPct(template.profitTarget, 1)} />
          <Row label="Daily drawdown" value={formatPct(template.dailyDrawdown, 1)} />
          <Row label="Max drawdown" value={formatPct(template.maxDrawdown, 1)} />
          <Row label="Max bet / pick" value={formatBetSize(template)} />
          <Row label="Consistency score" value={formatConsistency(template.consistencyScore)} />
          <Row
            label="Min trading days"
            value={
              template.minTradingDays === null || template.minTradingDays === undefined
                ? "—"
                : template.minTradingDays
            }
          />
          <Row
            label="Other rules"
            value={
              otherKeys.length === 0 ? (
                "—"
              ) : (
                <span className="max-w-[14rem] break-words font-mono text-[10px] leading-relaxed text-muted">
                  {JSON.stringify(template.otherRules)}
                </span>
              )
            }
          />
        </dl>
      </CardBody>
    </Card>
  );
}

/** Super Admin — read-only firm challenge templates (no edit controls). */
export function FirmChallengeTemplatesReadonly({
  templates,
  firmName,
}: {
  templates: ChallengeTemplateView[];
  firmName: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Challenge Rules by Model Type"
        subtitle={`Current templates for ${firmName} · read-only for support and auditing`}
        action={<Badge tone="neutral">Read-only</Badge>}
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {templates.map((template) => (
            <ModelTemplateCard key={template.modelType} template={template} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
