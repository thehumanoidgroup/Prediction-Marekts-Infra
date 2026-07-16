import { Badge } from "@/components/ui/badge";
import type { ChallengeAccount } from "@/lib/types";

const labels: Record<string, string> = {
  kalshi: "Kalshi",
  polymarket: "Polymarket",
  internal: "Internal",
  sp500_dynamic: "S&P 500",
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

  const tone =
    provider === "kalshi"
      ? "accent"
      : provider === "polymarket"
        ? "up"
        : provider === "sp500_dynamic"
          ? "neutral"
          : "neutral";
  const compactLabels: Record<string, string> = {
    kalshi: "Kalshi",
    polymarket: "Poly",
    sp500_dynamic: "SPX",
  };
  const label = compact
    ? compactLabels[provider] ?? labels[provider] ?? provider
    : labels[provider] ?? provider;

  return <Badge tone={tone}>{label}</Badge>;
}
