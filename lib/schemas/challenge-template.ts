import { z } from "zod";

export const challengeTemplateModelTypeSchema = z.enum(["1step", "2step", "3step", "instant"]);

export const DRAWDOWN_ORDER_ERROR =
  "Max drawdown must be greater than daily drawdown";

export const challengeTemplateSaveSchema = z
  .object({
    profitTarget: z.number().positive().max(100),
    dailyDrawdown: z.number().positive().max(100),
    maxDrawdown: z.number().positive().max(100),
    maxBetSizePerPick: z.number().positive(),
    maxBetSizeMode: z.enum(["percent", "fixed"]),
    maxBetSizeRules: z.record(z.string(), z.unknown()).nullable().optional(),
    consistencyScore: z.number().min(0).max(1).nullable().optional(),
    minTradingDays: z.number().int().min(0).max(365).nullable().optional(),
    otherRules: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => data.maxDrawdown > data.dailyDrawdown, {
    message: DRAWDOWN_ORDER_ERROR,
    path: ["maxDrawdown"],
  });

export type ChallengeTemplateSavePayload = z.infer<typeof challengeTemplateSaveSchema>;

/** Client-side guard mirroring the Zod refine. */
export function validateDrawdownOrder(
  dailyDrawdown: number,
  maxDrawdown: number,
): string | null {
  if (!(maxDrawdown > dailyDrawdown)) return DRAWDOWN_ORDER_ERROR;
  return null;
}
