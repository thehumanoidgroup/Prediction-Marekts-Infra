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
  /**
   * Saved PropFirmChallengeTemplate for this model type (when present).
   * Applied after PropFirmSettings model defaults and before purchase overrides.
   */
  firmChallengeTemplate?: {
    profitTarget: number;
    dailyDrawdown: number;
    maxDrawdown: number;
    maxBetSizePerPick: number;
    maxBetSizeMode: "percent" | "fixed";
    consistencyScore?: number | null;
    minTradingDays?: number | null;
    otherRules?: Record<string, unknown>;
  };
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

function firmTemplateToFlatCustom(
  template: NonNullable<DefaultRulesContext["firmChallengeTemplate"]>,
): Record<string, unknown> {
  const other = template.otherRules ?? {};
  const flat: Record<string, unknown> = {
    profitTarget: template.profitTarget,
    dailyDrawdown: template.dailyDrawdown,
    maxDrawdown: template.maxDrawdown,
    maxBetSizeValue: template.maxBetSizePerPick,
    maxBetSizeMode: template.maxBetSizeMode,
    consistencyScore: template.consistencyScore,
    minTradingDays: template.minTradingDays,
  };
  // Accept both snake_case (Python template other_rules) and camelCase keys.
  if (other.drawdown_mode != null) flat.drawdownMode = other.drawdown_mode;
  if (other.drawdownMode != null) flat.drawdownMode = other.drawdownMode;
  if (other.profit_split_pct != null) flat.profitSplitPct = other.profit_split_pct;
  if (other.profitSplitPct != null) flat.profitSplitPct = other.profitSplitPct;
  if (other.challenge_duration_days != null) {
    flat.challengeDurationDays = other.challenge_duration_days;
  }
  if (other.challengeDurationDays != null) {
    flat.challengeDurationDays = other.challengeDurationDays;
  }
  if (other.max_exposure_per_market != null) {
    flat.maxExposurePerMarket = other.max_exposure_per_market;
  }
  if (other.maxExposurePerMarket != null) {
    flat.maxExposurePerMarket = other.maxExposurePerMarket;
  }
  if (template.maxBetSizeMode === "fixed") {
    flat.maxStakePerOrder = template.maxBetSizePerPick;
  }
  return flat;
}

/**
 * Build the baseline ChallengeConfig for a sold account before firm overrides.
 *
 * Precedence (highest last):
 * platform preset → firm program → PropFirmSettings defaults →
 * PropFirmChallengeTemplate → purchase / admin customRules
 */
export function resolveDefaultChallengeConfig(ctx: DefaultRulesContext): ChallengeConfigInput {
  const preset = MODEL_PRESETS[ctx.modelType];
  const firm = ctx.firmProgram ?? {};
  const modelDefaults = ctx.firmModelDefaults ?? {};
  const firmCustom = ctx.firmDefaultCustomRules ?? {};
  const templateFlat = ctx.firmChallengeTemplate
    ? firmTemplateToFlatCustom(ctx.firmChallengeTemplate)
    : {};
  const purchase = ctx.customRules ?? {};

  const custom = {
    ...firmCustom,
    ...modelDefaultsToFlatCustom(modelDefaults),
    ...templateFlat,
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
