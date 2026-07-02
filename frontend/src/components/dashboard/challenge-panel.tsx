import type { ChallengeAccount } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconCheck, IconShield } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function formatObjectiveValue(value: number, unit: string): string {
  if (unit === "usd") return formatUsd(value);
  if (unit === "days") return `${Math.round(value)}`;
  return `${value}`;
}

/**
 * Challenge progress panel: objectives plus a live drawdown status meter
 * showing how much buffer remains before the account fails.
 */
export function ChallengePanel({ account }: { account: ChallengeAccount }) {
  const metCount = account.objectives.filter((o) => o.met).length;

  // Static drawdown policy: the floor sits a fixed % below start.
  const drawdownAmount = (account.maxDrawdownPct / 100) * account.startingBalance;
  const floor = account.startingBalance - drawdownAmount;
  const buffer = account.equity - floor;
  const bufferPct = Math.min(100, Math.max(0, (buffer / drawdownAmount) * 100));
  const health =
    bufferPct > 50
      ? { label: "Healthy", tone: "up" as const, text: "text-up" }
      : bufferPct > 20
        ? { label: "Caution", tone: "warn" as const, text: "text-warn" }
        : { label: "At risk", tone: "down" as const, text: "text-down" };

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Challenge progress"
        subtitle={`${account.label} · Day ${account.daysTraded}`}
        action={
          <Badge tone={metCount === account.objectives.length ? "up" : "neutral"}>
            {metCount}/{account.objectives.length} met
          </Badge>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-4">
        {/* Drawdown status */}
        <div className="rounded-lg border border-edge bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <IconShield className="text-sm text-muted" />
              Drawdown status
            </span>
            <Badge tone={health.tone}>{health.label}</Badge>
          </div>
          <Progress value={bufferPct} tone={health.tone} className="mt-2.5" />
          <div className="tabular mt-2 flex justify-between text-[11px] text-faint">
            <span>
              Floor <span className="font-semibold text-muted">{formatUsd(floor)}</span>
            </span>
            <span>
              Buffer{" "}
              <span className={cn("font-semibold", health.text)}>
                {formatUsd(Math.max(0, buffer))}
              </span>
            </span>
            <span>
              Equity <span className="font-semibold text-muted">{formatUsd(account.equity)}</span>
            </span>
          </div>
        </div>

        {/* Objectives */}
        {account.objectives.map((objective) => {
          const pct = objective.target > 0 ? (objective.current / objective.target) * 100 : 0;
          // For inverted objectives (loss limits) filling the bar is bad.
          const tone = objective.inverted
            ? pct > 75
              ? "down"
              : pct > 45
                ? "warn"
                : "accent"
            : objective.met
              ? "up"
              : "accent";
          return (
            <div key={objective.id}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  {objective.label}
                  {objective.met && !objective.inverted ? (
                    <IconCheck className="text-sm text-up" />
                  ) : null}
                </span>
                <span className="tabular text-muted">
                  <span
                    className={cn(
                      "font-semibold",
                      objective.inverted && pct > 75 ? "text-down" : "text-foreground",
                    )}
                  >
                    {formatObjectiveValue(objective.current, objective.unit)}
                  </span>{" "}
                  / {formatObjectiveValue(objective.target, objective.unit)}
                </span>
              </div>
              <Progress value={pct} tone={tone} />
            </div>
          );
        })}
        <p className="mt-auto border-t border-edge pt-3 text-[11px] leading-relaxed text-faint">
          Breaching the drawdown floor or a daily loss limit fails the challenge. Metrics update
          in real time as positions are marked to market.
        </p>
      </CardBody>
    </Card>
  );
}
