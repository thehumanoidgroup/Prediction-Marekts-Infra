import { Badge } from "@/components/ui/badge";
import type { ChallengeAccount } from "@/lib/types";

const labels: Record<string, string> = {
  kalshi: "Kalshi",
  polymarket: "Polymarket",
  internal: "Internal",
};

/** Small provider pill for account cards and headers. */
export function ProviderBadge({
  provider,
  compact = false,
}: {
  provider?: ChallengeAccount["provider"];
  compact?: boolean;
}) {
  if (!provider || provider === "internal") return null;

  const tone = provider === "kalshi" ? "accent" : provider === "polymarket" ? "up" : "neutral";
  const label = compact ? labels[provider]?.slice(0, 4) ?? provider : labels[provider] ?? provider;

  return <Badge tone={tone}>{label}</Badge>;
}
