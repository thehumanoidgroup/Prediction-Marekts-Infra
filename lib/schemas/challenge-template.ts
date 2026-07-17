import { z } from "zod";

export const challengeTemplateModelTypeSchema = z.enum(["1step", "2step", "3step", "instant"]);

export const challengeTemplateSaveSchema = z.object({
  profitTarget: z.number().positive().max(100),
  dailyDrawdown: z.number().positive().max(100),
  maxDrawdown: z.number().positive().max(100),
  maxBetSizePerPick: z.number().positive(),
  maxBetSizeMode: z.enum(["percent", "fixed"]),
  maxBetSizeRules: z.record(z.string(), z.unknown()).nullable().optional(),
  consistencyScore: z.number().min(0).max(1).nullable().optional(),
  minTradingDays: z.number().int().min(0).max(365).nullable().optional(),
  otherRules: z.record(z.string(), z.unknown()).optional(),
});

export type ChallengeTemplateSavePayload = z.infer<typeof challengeTemplateSaveSchema>;
