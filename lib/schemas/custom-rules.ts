/**
 * Strict validation for webhook/manual `custom_rules` JSON overrides.
 */

import { z } from "zod";
import { DEFAULT_ALLOWED_OVERRIDE_FIELDS } from "@/types/firm-settings";

export const CUSTOM_RULES_MAX_KEYS = 20;
export const CUSTOM_RULES_MAX_JSON_BYTES = 4_096;

const drawdownModeSchema = z.enum(["static", "trailing", "absolute"]);
const maxBetSizeModeSchema = z.enum(["percent", "fixed"]);

/** Flat primitive values only — no nested objects or arrays. */
const customRulePrimitiveSchema = z.union([
  z.number().finite(),
  z.string().max(200),
  z.boolean(),
  z.null(),
]);

const customRuleKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Keys must be alphanumeric identifiers");

/**
 * Known override fields with type and range constraints.
 * Unknown keys are rejected to prevent arbitrary JSON injection.
 */
export const customRulesFieldsSchema = z
  .object({
    profitTarget: z.number().positive().max(100).optional(),
    dailyDrawdown: z.number().positive().max(100).optional(),
    maxDailyLossPct: z.number().positive().max(100).optional(),
    maxDrawdown: z.number().positive().max(100).optional(),
    maxDrawdownPct: z.number().positive().max(100).optional(),
    maxBetSizeValue: z.number().positive().max(1_000_000).optional(),
    maxBetSizeMode: maxBetSizeModeSchema.optional(),
    consistencyScore: z.number().min(0).max(100).nullable().optional(),
    minTradingDays: z.number().int().min(0).max(365).optional(),
    challengeDurationDays: z.number().int().min(1).max(365).optional(),
    maxStakePerOrder: z.number().positive().max(10_000_000).optional(),
    maxExposurePerMarket: z.number().positive().max(50_000_000).optional(),
    drawdownMode: drawdownModeSchema.optional(),
    profitSplitPct: z.number().min(0).max(100).optional(),
  })
  .strict();

export const customRulesSchema = z
  .record(customRuleKeySchema, customRulePrimitiveSchema)
  .superRefine((rules, ctx) => {
    const keys = Object.keys(rules);
    if (keys.length > CUSTOM_RULES_MAX_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `custom_rules cannot contain more than ${CUSTOM_RULES_MAX_KEYS} keys`,
      });
      return;
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(rules);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "custom_rules must be valid JSON",
      });
      return;
    }

    if (serialized.length > CUSTOM_RULES_MAX_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `custom_rules payload exceeds ${CUSTOM_RULES_MAX_JSON_BYTES} bytes`,
      });
    }

    const allowed = new Set<string>(DEFAULT_ALLOWED_OVERRIDE_FIELDS);
    allowed.add("maxDailyLossPct");
    allowed.add("maxDrawdownPct");

    for (const key of keys) {
      if (!allowed.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown custom_rules field: ${key}`,
          path: [key],
        });
      }
    }

    const parsed = customRulesFieldsSchema.safeParse(rules);
    if (!parsed.success) {
      for (const issue of parsed.error.errors) {
        ctx.addIssue({
          ...issue,
          path: issue.path,
        });
      }
    }

    const mode = rules.maxBetSizeMode;
    const value = rules.maxBetSizeValue;
    if (mode === "percent" && typeof value === "number" && value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxBetSizeValue cannot exceed 100 when maxBetSizeMode is percent",
        path: ["maxBetSizeValue"],
      });
    }
  })
  .optional();

export type CustomRulesInput = z.infer<typeof customRulesSchema>;

/** Parse custom_rules with strict validation (returns undefined when omitted). */
export function parseCustomRules(
  value: unknown,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  return customRulesSchema.parse(value);
}
