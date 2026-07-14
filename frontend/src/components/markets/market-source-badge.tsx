import type { LiveEventSource } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const sourceStyles: Record<LiveEventSource, string> = {
  internal: "bg-accent-soft text-accent",
  polymarket: "bg-[#6366f1]/15 text-[#a5b4fc]",
  external: "bg-orange-500/15 text-orange-300",
};

const sourceLabels: Record<LiveEventSource, string> = {
  internal: "Internal",
  polymarket: "Polymarket",
  external: "External",
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
      {compact ? (source === "internal" ? "LMSR" : source === "polymarket" ? "Poly" : "Ext") : sourceLabels[source]}
    </Badge>
  );
}
