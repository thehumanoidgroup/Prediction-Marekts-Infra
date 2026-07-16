import type { PlatformActivity, PlatformActivityType } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const typeLabels: Record<PlatformActivityType, string> = {
  firm_onboarded: "Onboarding",
  trader_passed: "Pass",
  trader_failed: "Fail",
  market_created: "Market",
  market_resolved: "Resolved",
  volume_milestone: "Milestone",
  risk_alert: "Risk",
  account_provisioned: "Provisioned",
  account_provisioning_failed: "Provision failed",
};

const typeTones: Record<PlatformActivityType, "accent" | "up" | "down" | "warn"> = {
  firm_onboarded: "accent",
  trader_passed: "up",
  trader_failed: "down",
  market_created: "accent",
  market_resolved: "up",
  volume_milestone: "up",
  risk_alert: "warn",
  account_provisioned: "up",
  account_provisioning_failed: "down",
};

/** Chronological platform activity list for the Super Admin overview. */
export function ActivityFeed({
  items,
  limit,
}: {
  items: PlatformActivity[];
  limit?: number;
}) {
  const visible = limit ? items.slice(0, limit) : items;

  return (
    <ul className="divide-y divide-edge/60">
      {visible.map((item) => (
        <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted">
            {item.tenantName?.slice(0, 1) ?? "P"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={typeTones[item.type]}>{typeLabels[item.type]}</Badge>
              {item.tenantName ? (
                <span className="text-xs font-medium text-foreground">{item.tenantName}</span>
              ) : (
                <span className="text-xs font-medium text-muted">Platform</span>
              )}
              <span className="text-[11px] text-faint">{formatRelativeTime(item.ts)}</span>
            </div>
            <p className={cn("mt-1 text-sm text-muted")}>{item.message}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
