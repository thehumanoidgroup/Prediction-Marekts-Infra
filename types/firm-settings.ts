/**
 * Prop firm provisioning settings — default rules per model type,
 * allowed account sizes, and purchaser override policy.
 */

import type { AccountSize, MaxBetSizeMode, PropFirmModelType } from "@/types/provisioning";

export const ALL_MODEL_TYPES: PropFirmModelType[] = ["1step", "2step", "3step", "instant"];

export const ALL_ACCOUNT_SIZES: AccountSize[] = [
  "10K",
  "25K",
  "50K",
  "100K",
  "500K",
  "1M",
  "2M",
];

/** Default challenge fields a firm can allow purchasers to override. */
export const DEFAULT_ALLOWED_OVERRIDE_FIELDS = [
  "profitTarget",
  "dailyDrawdown",
  "maxDrawdown",
  "maxBetSizeValue",
  "maxBetSizeMode",
  "consistencyScore",
  "minTradingDays",
  "challengeDurationDays",
  "maxStakePerOrder",
  "maxExposurePerMarket",
  "drawdownMode",
  "profitSplitPct",
] as const;

export type AllowedOverrideField = (typeof DEFAULT_ALLOWED_OVERRIDE_FIELDS)[number];

/** Per-model default challenge rule overrides for a prop firm. */
export interface ModelTypeDefaults {
  profitTarget?: number;
  dailyDrawdown?: number;
  maxDrawdown?: number;
  maxBetSizeValue?: number;
  maxBetSizeMode?: MaxBetSizeMode;
  consistencyScore?: number | null;
  minTradingDays?: number;
  challengeDurationDays?: number;
  maxStakePerOrder?: number;
  maxExposurePerMarket?: number;
  drawdownMode?: string;
  profitSplitPct?: number;
}

export type ModelDefaultsMap = Partial<Record<PropFirmModelType, ModelTypeDefaults>>;

export interface PropFirmSettingsRecord {
  id: string;
  tenantId: string;
  allowedModelTypes: PropFirmModelType[];
  allowedAccountSizes: AccountSize[];
  modelDefaults: ModelDefaultsMap;
  allowedOverrideFields: string[];
  defaultCustomRules: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PropFirmSettingsInput {
  allowedModelTypes?: PropFirmModelType[];
  allowedAccountSizes?: AccountSize[];
  modelDefaults?: ModelDefaultsMap;
  allowedOverrideFields?: string[];
  defaultCustomRules?: Record<string, unknown>;
}
