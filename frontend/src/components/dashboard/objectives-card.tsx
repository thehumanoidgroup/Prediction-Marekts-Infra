import type { ChallengeAccount } from "@/lib/types";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconCheck } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function formatObjectiveValue(value: number, unit: string): string {
  if (unit === "usd") return formatUsd(value);
  if (unit === "days") return `${Math.round(value)}`;
  return `${value}`;
}

/** Challenge rules tracker — profit target, loss limits, trading days. */
export function ObjectivesCard({ account }: { account: ChallengeAccount }) {
  const metCount = account.objectives.filter((o) => o.met).length;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Challenge objectives"
        subtitle={`${account.label} · Day ${account.daysTraded}`}
        action={
          <Badge tone={metCount === account.objectives.length ? "up" : "neutral"}>
            {metCount}/{account.objectives.length} met
          </Badge>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-4">
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
          Breaching a loss limit fails the challenge. Objectives update in real time as positions
          are marked to market.
        </p>
      </CardBody>
    </Card>
  );
}
