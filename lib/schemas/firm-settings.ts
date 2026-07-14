import { z } from "zod";
import {
  ALL_ACCOUNT_SIZES,
  ALL_MODEL_TYPES,
  DEFAULT_ALLOWED_OVERRIDE_FIELDS,
} from "@/types/firm-settings";

const modelTypeSchema = z.enum(["1step", "2step", "3step", "instant"]);
const accountSizeSchema = z.enum(["10K", "25K", "50K", "100K", "500K", "1M", "2M"]);
const maxBetSizeModeSchema = z.enum(["percent", "fixed"]);

export const modelTypeDefaultsSchema = z.object({
  profitTarget: z.number().positive().max(100).optional(),
  dailyDrawdown: z.number().positive().max(100).optional(),
  maxDrawdown: z.number().positive().max(100).optional(),
  maxBetSizeValue: z.number().positive().optional(),
  maxBetSizeMode: maxBetSizeModeSchema.optional(),
  consistencyScore: z.number().min(0).max(100).nullable().optional(),
  minTradingDays: z.number().int().min(0).max(365).optional(),
  challengeDurationDays: z.number().int().min(1).max(365).optional(),
  maxStakePerOrder: z.number().positive().optional(),
  maxExposurePerMarket: z.number().positive().optional(),
  drawdownMode: z.enum(["static", "trailing", "absolute"]).optional(),
  profitSplitPct: z.number().min(0).max(100).optional(),
});

export const modelDefaultsMapSchema = z
  .object({
    "1step": modelTypeDefaultsSchema.optional(),
    "2step": modelTypeDefaultsSchema.optional(),
    "3step": modelTypeDefaultsSchema.optional(),
    instant: modelTypeDefaultsSchema.optional(),
  })
  .partial();

export const propFirmSettingsPatchSchema = z
  .object({
    allowedModelTypes: z.array(modelTypeSchema).min(1).optional(),
    allowedAccountSizes: z.array(accountSizeSchema).min(1).optional(),
    modelDefaults: modelDefaultsMapSchema.optional(),
    allowedOverrideFields: z.array(z.string().min(1)).optional(),
    defaultCustomRules: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.allowedOverrideFields) {
      const allowed = new Set<string>(DEFAULT_ALLOWED_OVERRIDE_FIELDS);
      for (const field of data.allowedOverrideFields) {
        if (!allowed.has(field)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown override field: ${field}`,
            path: ["allowedOverrideFields"],
          });
        }
      }
    }
  });

export const propFirmSettingsRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  allowedModelTypes: z.array(modelTypeSchema),
  allowedAccountSizes: z.array(accountSizeSchema),
  modelDefaults: modelDefaultsMapSchema,
  allowedOverrideFields: z.array(z.string()),
  defaultCustomRules: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PropFirmSettingsPatchInput = z.infer<typeof propFirmSettingsPatchSchema>;

export { ALL_MODEL_TYPES, ALL_ACCOUNT_SIZES };
