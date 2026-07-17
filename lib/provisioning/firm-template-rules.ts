/**
 * Map PropFirmChallengeTemplate rows onto issuance challenge_rules payloads.
 */

import type { ChallengeRulesInput } from "@/lib/account-provisioning";
import type { ChallengeTemplateView } from "@/lib/provisioning/challenge-template-defaults";
import type { PropFirmModelType } from "@/types/provisioning";

export const FIRM_MODEL_TYPE_LABELS: Record<PropFirmModelType, string> = {
  "1step": "1-Step",
  "2step": "2-Step",
  "3step": "3-Step",
  instant: "Instant",
};

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function drawdownMode(
  value: unknown,
): ChallengeRulesInput["drawdown_mode"] | undefined {
  if (value === "static" || value === "trailing" || value === "absolute") return value;
  return undefined;
}

/** Convert a firm template into editable issuance overrides (snake_case API shape). */
export function firmTemplateToChallengeRulesInput(
  template: ChallengeTemplateView,
  accountSizeUsd: number,
): ChallengeRulesInput {
  const other = template.otherRules ?? {};
  const stake =
    template.maxBetSizeMode === "fixed"
      ? template.maxBetSizePerPick
      : Math.round((template.maxBetSizePerPick / 100) * accountSizeUsd * 100) / 100;

  const exposure =
    num(other.max_exposure_per_market) ??
    num(other.maxExposurePerMarket) ??
    Math.round(stake * 2 * 100) / 100;

  return {
    profit_target_pct: template.profitTarget,
    max_daily_loss_pct: template.dailyDrawdown,
    max_drawdown_pct: template.maxDrawdown,
    max_stake_per_order: stake,
    max_exposure_per_market: exposure,
    min_consistency_score: template.consistencyScore ?? undefined,
    min_trading_days: template.minTradingDays ?? undefined,
    challenge_duration_days:
      num(other.challenge_duration_days) ?? num(other.challengeDurationDays),
    profit_split_pct: num(other.profit_split_pct) ?? num(other.profitSplitPct),
    drawdown_mode:
      drawdownMode(other.drawdown_mode) ?? drawdownMode(other.drawdownMode) ?? "static",
  };
}

/** CamelCase customRules shape used by Prisma provisioning. */
export function firmTemplateToCustomRules(
  template: ChallengeTemplateView,
  accountSizeUsd: number,
): Record<string, unknown> {
  const snake = firmTemplateToChallengeRulesInput(template, accountSizeUsd);
  return {
    profitTarget: snake.profit_target_pct,
    dailyDrawdown: snake.max_daily_loss_pct,
    maxDrawdown: snake.max_drawdown_pct,
    maxDailyLossPct: snake.max_daily_loss_pct,
    maxDrawdownPct: snake.max_drawdown_pct,
    maxStakePerOrder: snake.max_stake_per_order,
    maxExposurePerMarket: snake.max_exposure_per_market,
    consistencyScore: snake.min_consistency_score,
    minTradingDays: snake.min_trading_days,
    challengeDurationDays: snake.challenge_duration_days,
    profitSplitPct: snake.profit_split_pct,
    drawdownMode: snake.drawdown_mode,
    maxBetSizeMode: template.maxBetSizeMode,
    maxBetSizeValue:
      template.maxBetSizeMode === "fixed"
        ? template.maxBetSizePerPick
        : template.maxBetSizePerPick,
  };
}
