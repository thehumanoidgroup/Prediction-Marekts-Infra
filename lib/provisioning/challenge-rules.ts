/**
 * Normalize admin/webhook challenge rule payloads (snake_case or camelCase)
 * into the camelCase shape expected by provisioning schemas.
 */

const SNAKE_TO_CAMEL: Record<string, string> = {
  profit_target_pct: "profitTarget",
  max_daily_loss_pct: "maxDailyLossPct",
  max_drawdown_pct: "maxDrawdownPct",
  drawdown_mode: "drawdownMode",
  max_stake_per_order: "maxStakePerOrder",
  max_exposure_per_market: "maxExposurePerMarket",
  max_total_exposure: "maxTotalExposure",
  min_consistency_score: "consistencyScore",
  min_trading_days: "minTradingDays",
  challenge_duration_days: "challengeDurationDays",
  profit_split_pct: "profitSplitPct",
  max_bet_size_value: "maxBetSizeValue",
  max_bet_size_mode: "maxBetSizeMode",
  sp500_tickers: "sp500Tickers",
};

const PROVIDER_META_KEYS = new Set([
  "provider",
  "sp500Tickers",
  "sp500_tickers",
  "kalshiMarketTickers",
  "kalshi_market_tickers",
]);

export type MarketProviderName = "internal" | "polymarket" | "kalshi" | "sp500_dynamic";

export function normalizeProvider(value: unknown, fallback: MarketProviderName = "kalshi"): MarketProviderName {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "internal" ||
    normalized === "polymarket" ||
    normalized === "kalshi" ||
    normalized === "sp500_dynamic"
  ) {
    return normalized;
  }
  return fallback;
}

/** Map mixed snake/camel challenge rule objects into camelCase override fields. */
export function normalizeChallengeRulesInput(
  rules: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!rules) return {};
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rules)) {
    if (value === undefined) continue;
    const mapped = SNAKE_TO_CAMEL[key] ?? key;

    if (mapped === "consistencyScore" && typeof value === "number" && value > 0 && value <= 1) {
      // Admin UI historically used 0–1; challenge config stores 0–100.
      out[mapped] = Math.round(value * 100);
      continue;
    }

    if (mapped === "sp500Tickers" && Array.isArray(value)) {
      out[mapped] = value.map((t) => String(t).toUpperCase()).filter(Boolean);
      continue;
    }

    out[mapped] = value;
  }

  return out;
}

/**
 * Split purchase overrides from provider metadata so firm allow-lists do not
 * strip provider / ticker linkage required for market feeds.
 */
export function splitProviderMeta(rules: Record<string, unknown>): {
  customRules: Record<string, unknown>;
  providerMeta: Record<string, unknown>;
} {
  const customRules: Record<string, unknown> = {};
  const providerMeta: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rules)) {
    if (PROVIDER_META_KEYS.has(key)) {
      providerMeta[key === "sp500_tickers" ? "sp500Tickers" : key === "kalshi_market_tickers" ? "kalshiMarketTickers" : key] =
        value;
    } else {
      customRules[key] = value;
    }
  }

  return { customRules, providerMeta };
}
