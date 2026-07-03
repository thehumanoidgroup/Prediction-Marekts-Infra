import type { ChallengeAccount } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconCheck, IconShield } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const phaseLabels: Record<ChallengeAccount["phase"], string> = {
  evaluation: "Evaluation",
  verification: "Verification",
  funded: "Funded",
};

const phaseTones: Record<ChallengeAccount["phase"], "accent" | "up" | "warn"> = {
  evaluation: "accent",
  verification: "warn",
  funded: "up",
};

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
  const overallPct = (metCount / account.objectives.length) * 100;

  const profitObjective = account.objectives.find((o) => o.id === "profit-target");
  const profitPct = profitObjective
    ? Math.min(100, (profitObjective.current / profitObjective.target) * 100)
    : 0;

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

  const daysLeft = Math.max(0, account.minTradingDays - account.daysTraded);

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Phase strip */}
      <div className="flex items-center justify-between border-b border-edge bg-surface-2/80 px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <IconShield className="text-sm text-accent" />
          <span className="text-xs font-semibold text-foreground">{account.label}</span>
        </div>
        <Badge tone={phaseTones[account.phase]}>{phaseLabels[account.phase]}</Badge>
      </div>

      <CardHeader
        title="Challenge progress"
        subtitle={`Day ${account.daysTraded} · ${daysLeft > 0 ? `${daysLeft} days to min` : "Min days met"}`}
        action={
          <Badge tone={metCount === account.objectives.length ? "up" : "neutral"}>
            {metCount}/{account.objectives.length} met
          </Badge>
        }
        className="pt-3"
      />
      <CardBody className="flex flex-1 flex-col gap-4">
        {/* Overall completion */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-muted">Overall completion</span>
            <span className="tabular font-semibold text-foreground">
              {Math.round(overallPct)}%
            </span>
          </div>
          <Progress value={overallPct} tone={overallPct >= 100 ? "up" : "accent"} className="h-2" />
        </div>

        {/* Profit target highlight */}
        {profitObjective ? (
          <div className="rounded-xl border border-accent/20 bg-accent-soft/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Profit target</span>
              <span className="tabular text-muted">
                <span className="font-bold text-accent">
                  {formatObjectiveValue(profitObjective.current, profitObjective.unit)}
                </span>{" "}
                / {formatObjectiveValue(profitObjective.target, profitObjective.unit)}
              </span>
            </div>
            <Progress value={profitPct} tone="accent" className="mt-2 h-2" />
          </div>
        ) : null}

        {/* Drawdown status */}
        <div className="rounded-xl border border-edge bg-surface-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Drawdown buffer</span>
            <Badge tone={health.tone}>{health.label}</Badge>
          </div>
          <Progress value={bufferPct} tone={health.tone} className="mt-2.5 h-2" />
          <div className="tabular mt-2 grid grid-cols-3 gap-1 text-[10px] text-faint sm:text-[11px]">
            <span>
              Floor{" "}
              <span className="block font-semibold text-muted sm:inline">
                {formatUsd(floor)}
              </span>
            </span>
            <span className="text-center">
              Buffer{" "}
              <span className={cn("block font-semibold sm:inline", health.text)}>
                {formatUsd(Math.max(0, buffer))}
              </span>
            </span>
            <span className="text-right">
              Equity{" "}
              <span className="block font-semibold text-muted sm:inline">
                {formatUsd(account.equity)}
              </span>
            </span>
          </div>
        </div>

        {/* Objectives */}
        <div className="space-y-3">
          {account.objectives
            .filter((o) => o.id !== "profit-target")
            .map((objective) => {
              const pct =
                objective.target > 0 ? (objective.current / objective.target) * 100 : 0;
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
        </div>

        <p className="mt-auto border-t border-edge pt-3 text-[11px] leading-relaxed text-faint">
          Breaching the drawdown floor or a daily loss limit fails the challenge. Metrics update
          in real time as positions are marked to market.
        </p>
      </CardBody>
    </Card>
  );
}
