import { Card, CardBody } from "@/components/ui/card";
import { IconArrowDownRight, IconArrowUpRight } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: string;
  /** Secondary line, e.g. a delta or context. */
  sub?: string;
  trend?: "up" | "down" | "flat";
}

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="overflow-hidden">
          <CardBody className="relative pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              {stat.label}
            </p>
            <p className="tabular mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">
              {stat.value}
            </p>
            {stat.sub ? (
              <p
                className={cn(
                  "tabular mt-1 flex items-center gap-1 text-xs font-medium",
                  stat.trend === "up" && "text-up",
                  stat.trend === "down" && "text-down",
                  (!stat.trend || stat.trend === "flat") && "text-muted",
                )}
              >
                {stat.trend === "up" && <IconArrowUpRight className="text-sm" />}
                {stat.trend === "down" && <IconArrowDownRight className="text-sm" />}
                {stat.sub}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
