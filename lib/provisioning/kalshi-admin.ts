/**
 * Helpers for firm-admin Kalshi issuance UI backed by Prisma provisioning.
 */

import type { ChallengeRules } from "@/lib/account-provisioning";
import type { ChallengeConfigInput } from "@/types/provisioning";
import type { AccountSize as ApiAccountSize, PropFirmAccountRecord, PropFirmModelType } from "@/types/provisioning";
import {
  defaultVirtualBalance,
  fromApiAccountSize,
  toApiAccountSize,
} from "@/lib/provisioning/serialize";
import type { ProvisionNewAccountResult } from "@/services/account-provisioning";

const NUMERIC_TO_API: Record<number, ApiAccountSize> = {
  10_000: "10K",
  25_000: "25K",
  50_000: "50K",
  100_000: "100K",
  500_000: "500K",
  1_000_000: "1M",
  2_000_000: "2M",
};

export function numericAccountSizeToApi(size: number): ApiAccountSize {
  const direct = NUMERIC_TO_API[size];
  if (direct) return direct;

  const tiers = Object.entries(NUMERIC_TO_API).map(([value, label]) => ({
    value: Number(value),
    label: label as ApiAccountSize,
  }));
  tiers.sort((a, b) => a.value - b.value);
  let closest = tiers[0]?.label ?? "25K";
  let minDiff = Infinity;
  for (const tier of tiers) {
    const diff = Math.abs(tier.value - size);
    if (diff < minDiff) {
      minDiff = diff;
      closest = tier.label;
    }
  }
  return closest;
}

export function challengeConfigToRules(
  config: ChallengeConfigInput,
  input: {
    provider: string;
    modelType: PropFirmModelType;
    accountSize: ApiAccountSize;
  },
): ChallengeRules {
  const rules = config.otherCustomRules ?? {};
  const maxStake =
    config.maxBetSizeMode === "fixed"
      ? config.maxBetSizeValue
      : (config.maxBetSizeValue / 100) * defaultVirtualBalance(input.accountSize);

  return {
    model_type: input.modelType,
    account_size: defaultVirtualBalance(input.accountSize),
    currency: "USD",
    profit_target_pct: config.profitTarget,
    max_daily_loss_pct: config.dailyDrawdown,
    max_drawdown_pct: config.maxDrawdown,
    drawdown_mode: String(rules.drawdownMode ?? "static"),
    max_stake_per_order: maxStake,
    max_exposure_per_market: Number(rules.maxExposurePerMarket ?? maxStake * 2),
    max_total_exposure: null,
    min_consistency_score:
      config.consistencyScore === null || config.consistencyScore === undefined
        ? null
        : config.consistencyScore,
    min_trading_days: Number(rules.minTradingDays ?? 10),
    challenge_duration_days: Number(rules.challengeDurationDays ?? 60),
    profit_split_pct: Number(rules.profitSplitPct ?? 80),
    provider: input.provider,
  };
}

export function toKalshiProvisionResponse(
  result: ProvisionNewAccountResult,
  input: { displayName?: string; provider?: string; sp500Tickers?: string[] },
) {
  const { account, credentials, emails } = result;
  const balance = account.traderDemoAccount?.virtualBalance ?? defaultVirtualBalance(account.accountSize);
  const provider = input.provider ?? "kalshi";
  const isKalshi = provider === "kalshi";
  const isSp500 = provider === "sp500_dynamic";

  return {
    status: "created" as const,
    message: "Account provisioned",
    user_id: account.id,
    account_id: account.id,
    trader_demo_account_id: account.traderDemoAccount?.id ?? account.id,
    sold_record_id: account.id,
    email: account.traderEmail,
    display_name: input.displayName?.trim() || account.traderEmail.split("@")[0],
    provider,
    account_size: balance,
    model_type: account.modelType,
    created_user: true,
    email_sent: Boolean(emails?.trader?.sent || account.credentialsSentAt),
    credentials_generated: true,
    kalshi_live_integration_enabled: isKalshi,
    kalshi_market_tickers: [] as string[],
    sp500_dynamic_enabled: isSp500,
    sp500_tickers: isSp500 ? (input.sp500Tickers ?? []) : [],
    temporary_password: credentials.password ?? null,
    applied_rules: challengeConfigToRules(
      account.challengeConfig
        ? {
            profitTarget: account.challengeConfig.profitTarget,
            dailyDrawdown: account.challengeConfig.dailyDrawdown,
            maxDrawdown: account.challengeConfig.maxDrawdown,
            maxBetSizeValue: account.challengeConfig.maxBetSizeValue,
            maxBetSizeMode: account.challengeConfig.maxBetSizeMode,
            consistencyScore: account.challengeConfig.consistencyScore,
            otherCustomRules: account.challengeConfig.otherCustomRules,
          }
        : {
            profitTarget: 10,
            dailyDrawdown: 5,
            maxDrawdown: 10,
            maxBetSizeValue: 2.5,
            maxBetSizeMode: "percent",
            consistencyScore: null,
            otherCustomRules: {},
          },
      {
        provider,
        modelType: account.modelType,
        accountSize: account.accountSize,
      },
    ),
  };
}

export function toFirmSoldAccount(row: PropFirmAccountRecord, displayName?: string) {
  const rules = row.challengeConfig?.otherCustomRules ?? {};
  return {
    id: row.id,
    created_at: row.createdAt,
    trader_demo_account_id: row.traderDemoAccount?.id ?? null,
    provider: String(rules.provider ?? "kalshi"),
    issuance_source: "manual",
    account_size: defaultVirtualBalance(row.accountSize),
    model_type: row.modelType,
    trader_email: row.traderEmail,
    trader_display_name: displayName ?? row.traderEmail.split("@")[0],
    kalshi_market_tickers: null,
    sp500_tickers: Array.isArray(rules.sp500Tickers) ? (rules.sp500Tickers as string[]) : null,
    credentials_generated: true,
    email_sent: Boolean(row.credentialsSentAt),
  };
}

export function fromApiModelTypeLoose(value: string): PropFirmModelType {
  const normalized = value.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalized === "1step" || normalized === "onestep") return "1step";
  if (normalized === "2step" || normalized === "twostep") return "2step";
  if (normalized === "3step" || normalized === "threestep") return "3step";
  return "instant";
}

export { fromApiAccountSize, toApiAccountSize };
