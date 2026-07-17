/**
 * Client-safe defaults and view types for prop-firm challenge templates.
 * (No Prisma — safe to import from client components.)
 */

import type {
  MaxBetSizeMode,
  PropFirmChallengeTemplateRecord,
  PropFirmModelType,
} from "@/types/provisioning";

export const CHALLENGE_MODEL_TYPES: PropFirmModelType[] = [
  "1step",
  "2step",
  "3step",
  "instant",
];

/** Built-in defaults — aligned with Python `MODEL_TYPE_PRESETS` + template service. */
export const CHALLENGE_TEMPLATE_DEFAULTS: Record<
  PropFirmModelType,
  {
    profitTarget: number;
    dailyDrawdown: number;
    maxDrawdown: number;
    maxBetSizePerPick: number;
    maxBetSizeMode: MaxBetSizeMode;
    consistencyScore: number | null;
    minTradingDays: number;
    otherRules: Record<string, unknown>;
  }
> = {
  "1step": {
    profitTarget: 10,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxBetSizePerPick: 2,
    maxBetSizeMode: "percent",
    consistencyScore: null,
    minTradingDays: 10,
    otherRules: {
      drawdown_mode: "static",
      profit_split_pct: 80,
      challenge_duration_days: 60,
    },
  },
  "2step": {
    profitTarget: 8,
    dailyDrawdown: 4,
    maxDrawdown: 8,
    maxBetSizePerPick: 2,
    maxBetSizeMode: "percent",
    consistencyScore: 0.55,
    minTradingDays: 14,
    otherRules: {
      drawdown_mode: "trailing",
      profit_split_pct: 85,
      challenge_duration_days: 90,
    },
  },
  "3step": {
    profitTarget: 6,
    dailyDrawdown: 3,
    maxDrawdown: 6,
    maxBetSizePerPick: 2,
    maxBetSizeMode: "percent",
    consistencyScore: 0.6,
    minTradingDays: 21,
    otherRules: {
      drawdown_mode: "trailing",
      profit_split_pct: 90,
      challenge_duration_days: 120,
    },
  },
  instant: {
    profitTarget: 12,
    dailyDrawdown: 6,
    maxDrawdown: 12,
    maxBetSizePerPick: 2,
    maxBetSizeMode: "percent",
    consistencyScore: null,
    minTradingDays: 5,
    otherRules: {
      drawdown_mode: "static",
      profit_split_pct: 75,
      challenge_duration_days: 30,
    },
  },
};

export interface ChallengeTemplateView extends PropFirmChallengeTemplateRecord {
  /** True when no DB row exists — values are platform defaults. */
  isDefault: boolean;
}

export interface ChallengeTemplateSaveInput {
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  maxBetSizePerPick: number;
  maxBetSizeMode: MaxBetSizeMode;
  maxBetSizeRules?: Record<string, unknown> | null;
  consistencyScore?: number | null;
  minTradingDays?: number | null;
  otherRules?: Record<string, unknown>;
}

export function getDefaultTemplateFields(
  modelType: PropFirmModelType,
): ChallengeTemplateSaveInput {
  const defaults = CHALLENGE_TEMPLATE_DEFAULTS[modelType];
  return {
    profitTarget: defaults.profitTarget,
    dailyDrawdown: defaults.dailyDrawdown,
    maxDrawdown: defaults.maxDrawdown,
    maxBetSizePerPick: defaults.maxBetSizePerPick,
    maxBetSizeMode: defaults.maxBetSizeMode,
    maxBetSizeRules: null,
    consistencyScore: defaults.consistencyScore,
    minTradingDays: defaults.minTradingDays,
    otherRules: { ...defaults.otherRules },
  };
}
