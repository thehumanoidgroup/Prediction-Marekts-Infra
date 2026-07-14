import type { LiveEventSource } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const sourceStyles: Record<LiveEventSource, string> = {
  internal: "bg-accent-soft text-accent",
  polymarket: "bg-[#6366f1]/15 text-[#a5b4fc]",
};

const sourceLabels: Record<LiveEventSource, string> = {
  internal: "Internal",
  polymarket: "Polymarket",
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
      {compact ? (source === "internal" ? "LMSR" : "Poly") : sourceLabels[source]}
    </Badge>
  );
}
