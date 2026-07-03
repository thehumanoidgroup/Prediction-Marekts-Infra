/**
 * Zod validation schemas for prop firm account provisioning.
 * Serves as the Pydantic-equivalent request/response validation layer.
 */

import { z } from "zod";

const modelTypeSchema = z.enum(["1step", "2step", "3step", "instant"]);

const accountSizeSchema = z.enum(["10K", "25K", "50K", "100K", "500K", "1M", "2M"]);

const accountStatusSchema = z.enum(["pending", "provisioned", "activated", "expired"]);

const maxBetSizeModeSchema = z.enum(["percent", "fixed"]);

export const traderLoginCredentialsSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(8).max(256),
  loginUrl: z.string().url().optional(),
});

export const challengeConfigInputSchema = z
  .object({
    profitTarget: z.number().positive().max(100),
    dailyDrawdown: z.number().positive().max(100),
    maxDrawdown: z.number().positive().max(100),
    maxBetSizeValue: z.number().positive(),
    maxBetSizeMode: maxBetSizeModeSchema.default("percent"),
    consistencyScore: z.number().min(0).max(100).nullable().optional(),
    otherCustomRules: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((data, ctx) => {
    if (data.maxBetSizeMode === "percent" && data.maxBetSizeValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxBetSizeValue cannot exceed 100 when mode is percent",
        path: ["maxBetSizeValue"],
      });
    }
  });

export const propFirmAccountCreateSchema = z.object({
  propFirmId: z.string().uuid(),
  traderEmail: z.string().email().max(320),
  modelType: modelTypeSchema,
  accountSize: accountSizeSchema,
  purchasedAt: z.coerce.date().optional(),
  challengeConfig: challengeConfigInputSchema,
});

export const propFirmAccountStatusUpdateSchema = z.object({
  status: accountStatusSchema,
  credentialsSentAt: z.coerce.date().nullable().optional(),
});

export const provisionTraderDemoAccountSchema = z.object({
  propFirmAccountId: z.string().uuid(),
  virtualBalance: z.number().positive().max(10_000_000),
  loginCredentials: traderLoginCredentialsSchema,
});

export const challengeConfigRecordSchema = z.object({
  id: z.string().uuid(),
  propFirmAccountId: z.string().uuid(),
  profitTarget: z.number(),
  dailyDrawdown: z.number(),
  maxDrawdown: z.number(),
  maxBetSizeValue: z.number(),
  maxBetSizeMode: maxBetSizeModeSchema,
  consistencyScore: z.number().nullable(),
  otherCustomRules: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const traderDemoAccountRecordSchema = z.object({
  id: z.string().uuid(),
  propFirmAccountId: z.string().uuid(),
  challengeConfigId: z.string().uuid(),
  virtualBalance: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const propFirmAccountRecordSchema = z.object({
  id: z.string().uuid(),
  propFirmId: z.string().uuid(),
  traderEmail: z.string().email(),
  modelType: modelTypeSchema,
  accountSize: accountSizeSchema,
  status: accountStatusSchema,
  purchasedAt: z.string(),
  credentialsSentAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  challengeConfig: challengeConfigRecordSchema.nullable(),
  traderDemoAccount: traderDemoAccountRecordSchema.nullable(),
});

export type PropFirmAccountCreateInput = z.infer<typeof propFirmAccountCreateSchema>;
export type PropFirmAccountStatusUpdateInput = z.infer<typeof propFirmAccountStatusUpdateSchema>;
export type ProvisionTraderDemoAccountInput = z.infer<typeof provisionTraderDemoAccountSchema>;
