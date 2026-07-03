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

const challengeConfigBaseSchema = z.object({
  profitTarget: z.number().positive().max(100),
  dailyDrawdown: z.number().positive().max(100),
  maxDrawdown: z.number().positive().max(100),
  maxBetSizeValue: z.number().positive(),
  maxBetSizeMode: maxBetSizeModeSchema.default("percent"),
  consistencyScore: z.number().min(0).max(100).nullable().optional(),
  otherCustomRules: z.record(z.string(), z.unknown()).default({}),
});

export const challengeConfigInputSchema = challengeConfigBaseSchema.superRefine((data, ctx) => {
  if (data.maxBetSizeMode === "percent" && data.maxBetSizeValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "maxBetSizeValue cannot exceed 100 when mode is percent",
      path: ["maxBetSizeValue"],
    });
  }
});

export const challengeConfigOverridesSchema = challengeConfigBaseSchema.partial();

export const propFirmAccountCreateSchema = z.object({
  propFirmId: z.string().uuid(),
  traderEmail: z.string().email().max(320),
  modelType: modelTypeSchema,
  accountSize: accountSizeSchema,
  purchasedAt: z.coerce.date().optional(),
  challengeConfig: challengeConfigInputSchema,
});

/** Input for the full automated provisioning flow (rules resolved server-side). */
export const provisionNewAccountSchema = z.object({
  propFirmId: z.string().uuid(),
  traderEmail: z.string().email().max(320),
  modelType: modelTypeSchema,
  accountSize: accountSizeSchema,
  purchasedAt: z.coerce.date().optional(),
  customRules: z.record(z.string(), z.unknown()).optional(),
  challengeConfigOverrides: challengeConfigOverridesSchema.optional(),
  loginMode: z.enum(["password", "magic_link"]).default("password"),
  activateImmediately: z.boolean().default(false),
  sendEmails: z.boolean().default(true),
  async: z.boolean().optional(),
});

/** Webhook payload (snake_case) from prop firm checkout systems. */
export const provisioningWebhookSchema = z
  .object({
    prop_firm_id: z.string().uuid(),
    trader_email: z.string().email().max(320),
    model_type: modelTypeSchema,
    account_size: accountSizeSchema,
    custom_rules: z.record(z.string(), z.unknown()).optional(),
    purchased_at: z.coerce.date().optional(),
    async: z.boolean().optional(),
    activate_immediately: z.boolean().optional(),
    send_emails: z.boolean().optional(),
  })
  .transform((data) => ({
    propFirmId: data.prop_firm_id,
    traderEmail: data.trader_email,
    modelType: data.model_type,
    accountSize: data.account_size,
    customRules: data.custom_rules,
    purchasedAt: data.purchased_at,
    activateImmediately: data.activate_immediately ?? false,
    sendEmails: data.send_emails,
    async: data.async,
  }));

/** Super Admin manual provisioning (camelCase or snake_case). */
export const provisioningManualSchema = z
  .object({
    propFirmId: z.string().uuid().optional(),
    prop_firm_id: z.string().uuid().optional(),
    traderEmail: z.string().email().max(320).optional(),
    trader_email: z.string().email().max(320).optional(),
    modelType: modelTypeSchema.optional(),
    model_type: modelTypeSchema.optional(),
    accountSize: accountSizeSchema.optional(),
    account_size: accountSizeSchema.optional(),
    customRules: z.record(z.string(), z.unknown()).optional(),
    custom_rules: z.record(z.string(), z.unknown()).optional(),
    challengeConfigOverrides: challengeConfigOverridesSchema.optional(),
    challenge_config_overrides: challengeConfigOverridesSchema.optional(),
    loginMode: z.enum(["password", "magic_link"]).optional(),
    login_mode: z.enum(["password", "magic_link"]).optional(),
    activateImmediately: z.boolean().optional(),
    activate_immediately: z.boolean().optional(),
    sendEmails: z.boolean().optional(),
    send_emails: z.boolean().optional(),
    async: z.boolean().optional(),
    purchasedAt: z.coerce.date().optional(),
    purchased_at: z.coerce.date().optional(),
  })
  .transform((data) => ({
    propFirmId: data.propFirmId ?? data.prop_firm_id!,
    traderEmail: data.traderEmail ?? data.trader_email!,
    modelType: data.modelType ?? data.model_type!,
    accountSize: data.accountSize ?? data.account_size!,
    customRules: data.customRules ?? data.custom_rules,
    challengeConfigOverrides: data.challengeConfigOverrides ?? data.challenge_config_overrides,
    loginMode: data.loginMode ?? data.login_mode ?? "password",
    activateImmediately: data.activateImmediately ?? data.activate_immediately ?? false,
    purchasedAt: data.purchasedAt ?? data.purchased_at,
    sendEmails: data.sendEmails ?? data.send_emails,
    async: data.async,
  }))
  .superRefine((data, ctx) => {
    const required: Array<keyof typeof data> = [
      "propFirmId",
      "traderEmail",
      "modelType",
      "accountSize",
    ];
    for (const field of required) {
      if (data[field] === undefined || data[field] === null || data[field] === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${String(field)} is required`,
          path: [field],
        });
      }
    }
  });

export const listProvisioningAccountsQuerySchema = z.object({
  prop_firm_id: z.string().uuid().optional(),
  propFirmId: z.string().uuid().optional(),
  status: accountStatusSchema.optional(),
  trader_email: z.string().optional(),
  traderEmail: z.string().optional(),
  model_type: modelTypeSchema.optional(),
  modelType: modelTypeSchema.optional(),
  account_size: accountSizeSchema.optional(),
  accountSize: accountSizeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
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
export type ProvisionNewAccountInput = z.infer<typeof provisionNewAccountSchema>;
export type PropFirmAccountStatusUpdateInput = z.infer<typeof propFirmAccountStatusUpdateSchema>;
export type ProvisionTraderDemoAccountInput = z.infer<typeof provisionTraderDemoAccountSchema>;
