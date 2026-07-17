/**
 * Default challenge rules derived from model type and account size.
 *
 * Prop firms can override any field via `customRules` JSON or explicit
 * `challengeConfigOverrides` passed to the provisioning service.
 */

import type { TenantProgram } from "@/lib/tenants";
import type { ModelTypeDefaults } from "@/types/firm-settings";
import type {
  AccountSize,
  ChallengeConfigInput,
  PropFirmModelType,
} from "@/types/provisioning";
import { defaultVirtualBalance } from "@/lib/provisioning/serialize";

export interface DefaultRulesContext {
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  /** Optional firm-level program defaults from Tenant.program JSON. */
  firmProgram?: Partial<TenantProgram>;
  /** Per-model defaults from PropFirmSettings. */
  firmModelDefaults?: ModelTypeDefaults;
  /** Firm-wide custom JSON defaults from PropFirmSettings. */
  firmDefaultCustomRules?: Record<string, unknown>;
  /** Prop firm JSON overrides (webhook payload or admin form). */
  customRules?: Record<string, unknown>;
}

interface ModelTypePreset {
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  maxBetSizePct: number;
  minTradingDays: number;
  challengeDurationDays: number;
  phases: number;
  consistencyScore?: number;
}

export const MODEL_PRESETS: Record<PropFirmModelType, ModelTypePreset> = {
  "1step": {
    profitTarget: 10,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxBetSizePct: 2.5,
    minTradingDays: 10,
    challengeDurationDays: 60,
    phases: 1,
  },
  "2step": {
    profitTarget: 8,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxBetSizePct: 2,
    minTradingDays: 7,
    challengeDurationDays: 45,
    phases: 2,
    consistencyScore: 60,
  },
  "3step": {
    profitTarget: 6,
    dailyDrawdown: 4,
    maxDrawdown: 8,
    maxBetSizePct: 1.5,
    minTradingDays: 5,
    challengeDurationDays: 90,
    phases: 3,
    consistencyScore: 70,
  },
  instant: {
    profitTarget: 12,
    dailyDrawdown: 3,
    maxDrawdown: 6,
    maxBetSizePct: 1,
    minTradingDays: 3,
    challengeDurationDays: 30,
    phases: 1,
  },
};

/** Scale max stake caps with account size (USD). */
function maxStakeForSize(accountSize: AccountSize): number {
  const balance = defaultVirtualBalance(accountSize);
  if (balance <= 25_000) return 1_250;
  if (balance <= 50_000) return 2_500;
  if (balance <= 100_000) return 5_000;
  if (balance <= 500_000) return 12_500;
  if (balance <= 1_000_000) return 25_000;
  return 50_000;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function modelDefaultsToFlatCustom(defaults: ModelTypeDefaults): Record<string, unknown> {
  const rules: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== undefined) rules[key] = value;
  }
  return rules;
}

/**
 * Build the baseline ChallengeConfig for a sold account before firm overrides.
 */
export function resolveDefaultChallengeConfig(ctx: DefaultRulesContext): ChallengeConfigInput {
  const preset = MODEL_PRESETS[ctx.modelType];
  const firm = ctx.firmProgram ?? {};
  const modelDefaults = ctx.firmModelDefaults ?? {};
  const firmCustom = ctx.firmDefaultCustomRules ?? {};
  const purchase = ctx.customRules ?? {};

  // Precedence: purchase overrides → firm default custom → per-model defaults → program → platform preset
  const custom = {
    ...firmCustom,
    ...modelDefaultsToFlatCustom(modelDefaults),
    ...purchase,
  };

  const balance = defaultVirtualBalance(ctx.accountSize);

  const profitTarget = num(
    custom.profitTarget ?? firm.profitTargetPct,
    preset.profitTarget,
  );
  const dailyDrawdown = num(
    custom.dailyDrawdown ?? custom.maxDailyLossPct ?? firm.maxDailyLossPct,
    preset.dailyDrawdown,
  );
  const maxDrawdown = num(
    custom.maxDrawdown ?? custom.maxDrawdownPct ?? firm.maxDrawdownPct,
    preset.maxDrawdown,
  );

  const maxBetSizeMode =
    custom.maxBetSizeMode === "fixed" || custom.maxBetSizeMode === "percent"
      ? custom.maxBetSizeMode
      : "percent";

  const maxBetSizeValue = num(
    custom.maxBetSizeValue,
    maxBetSizeMode === "fixed"
      ? num(custom.maxStakePerOrder ?? firm.maxStakePerOrder, maxStakeForSize(ctx.accountSize))
      : preset.maxBetSizePct,
  );

  const otherCustomRules: Record<string, unknown> = {
    modelType: ctx.modelType,
    accountSize: ctx.accountSize,
    virtualBalance: balance,
    minTradingDays: num(custom.minTradingDays ?? firm.minTradingDays, preset.minTradingDays),
    challengeDurationDays: num(
      custom.challengeDurationDays ?? firm.challengeDurationDays,
      preset.challengeDurationDays,
    ),
    drawdownMode: str(custom.drawdownMode ?? firm.drawdownMode, "static"),
    maxExposurePerMarket: num(
      custom.maxExposurePerMarket ?? firm.maxExposurePerMarket,
      maxStakeForSize(ctx.accountSize) * 2,
    ),
    profitSplitPct: num(custom.profitSplitPct ?? firm.profitSplitPct, 80),
    phases: preset.phases,
    ...custom,
  };

  return {
    profitTarget,
    dailyDrawdown,
    maxDrawdown,
    maxBetSizeValue,
    maxBetSizeMode,
    consistencyScore:
      custom.consistencyScore !== undefined
        ? (custom.consistencyScore as number | null)
        : preset.consistencyScore ?? null,
    otherCustomRules,
  };
}

/**
 * Merge explicit challenge config overrides on top of resolved defaults.
 * Used when Super Admin or a webhook supplies partial rule updates.
 */
export function mergeChallengeConfig(
  base: ChallengeConfigInput,
  overrides?: Partial<ChallengeConfigInput>,
): ChallengeConfigInput {
  if (!overrides) return base;

  return {
    profitTarget: overrides.profitTarget ?? base.profitTarget,
    dailyDrawdown: overrides.dailyDrawdown ?? base.dailyDrawdown,
    maxDrawdown: overrides.maxDrawdown ?? base.maxDrawdown,
    maxBetSizeValue: overrides.maxBetSizeValue ?? base.maxBetSizeValue,
    maxBetSizeMode: overrides.maxBetSizeMode ?? base.maxBetSizeMode,
    consistencyScore:
      overrides.consistencyScore !== undefined
        ? overrides.consistencyScore
        : base.consistencyScore,
    templateId:
      overrides.templateId !== undefined ? overrides.templateId : base.templateId,
    otherCustomRules: {
      ...base.otherCustomRules,
      ...(overrides.otherCustomRules ?? {}),
    },
  };
}
