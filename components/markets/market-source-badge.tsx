import type { LiveEventSource } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const sourceStyles: Record<LiveEventSource, string> = {
  internal: "bg-accent-soft text-accent",
  polymarket: "bg-[#6366f1]/15 text-[#a5b4fc]",
  kalshi: "bg-[#22c55e]/15 text-[#86efac]",
  sp500_dynamic: "bg-[#0ea5e9]/15 text-[#7dd3fc]",
  external: "bg-orange-500/15 text-orange-300",
};

const sourceLabels: Record<LiveEventSource, string> = {
  internal: "Internal",
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  sp500_dynamic: "S&P 500",
  external: "External",
};

const compactLabels: Record<LiveEventSource, string> = {
  internal: "LMSR",
  polymarket: "Poly",
  kalshi: "Kalshi",
  sp500_dynamic: "SPX",
  external: "Ext",
};

export function MarketSourceBadge({
  source,
  className,
  compact = false,
}: {
  source: LiveEventSource;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Badge className={cn(sourceStyles[source], className)}>
      {compact ? compactLabels[source] : sourceLabels[source]}
    </Badge>
  );
}
