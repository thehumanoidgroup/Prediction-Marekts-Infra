/**
 * Account provisioning orchestration service.
 *
 * Equivalent of the requested `backend/services/account_provisioning.py` for the
 * Next.js / Prisma stack. Call from webhooks, Super Admin API routes, or
 * background jobs to fully automate sold-account setup.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildRiskProfile,
  listRiskProfiles,
  registerRiskProfile,
  type RiskProfile,
} from "@/lib/engine/risk";
import {
  logAccountProvisioned,
  logAccountProvisioningFailed,
} from "@/lib/platform/activity";
import { logProvisioningAudit } from "@/lib/provisioning/audit";
import { ProvisioningError, provisioningErrorBody } from "@/lib/provisioning/errors";
import { ensureSeeded } from "@/lib/seed";
import { encryptLoginCredentials } from "@/lib/provisioning/crypto";
import {
  credentialsFingerprint,
  generateLoginCredentials,
  type LoginDeliveryMode,
} from "@/lib/provisioning/credentials";
import {
  mergeChallengeConfig,
  resolveDefaultChallengeConfig,
} from "@/lib/provisioning/default-rules";
import {
  defaultVirtualBalance,
  fromApiAccountSize,
  fromApiMaxBetMode,
  fromApiModelType,
  serializePropFirmAccount,
} from "@/lib/provisioning/serialize";
import {
  filterAllowedPurchaseOverrides,
  getModelDefaultsForType,
  getOrCreateFirmSettings,
  validateProvisioningAgainstSettings,
} from "@/lib/provisioning/firm-settings";
import { tenantRowToConfig } from "@/lib/tenant-db";
import { provisionNewAccountSchema } from "@/lib/schemas/provisioning";
import { sendProvisioningEmails, type ProvisioningEmailResult } from "@/services/email";
import type {
  AccountSize,
  ChallengeConfigInput,
  PropFirmAccountRecord,
  PropFirmModelType,
  TraderLoginCredentials,
} from "@/types/provisioning";

interface ProvisioningAuditBase {
  propFirmId: string;
  traderEmail: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  source: "webhook" | "manual" | "job";
  apiKeyId?: string;
  actorUserId?: string;
  ipAddress?: string | null;
}

const accountInclude = {
  challengeConfig: true,
  traderDemoAccount: true,
} as const;

export interface ProvisionNewAccountInput {
  propFirmId: string;
  traderEmail: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  purchasedAt?: Date;
  /** Prop firm JSON overrides merged into default rules. */
  customRules?: Record<string, unknown>;
  /** Explicit partial overrides on top of resolved defaults. */
  challengeConfigOverrides?: Partial<ChallengeConfigInput>;
  /** How login credentials are generated. Default: `password`. */
  loginMode?: LoginDeliveryMode;
  /** After provisioning, set status to `activated` instead of `provisioned`. */
  activateImmediately?: boolean;
  /** Send trader + prop firm emails after provisioning. Default: true. */
  sendEmails?: boolean;
  /** Entry point for Super Admin activity metadata. */
  source?: "webhook" | "manual" | "job";
  provisionedBy?: string;
  /** Skip duplicate activity log when async queue already logged enqueue. */
  skipActivityLog?: boolean;
  /** Audit metadata (API key, admin user, IP). */
  auditContext?: {
    apiKeyId?: string;
    actorUserId?: string;
    ipAddress?: string | null;
  };
}

export interface ProvisionNewAccountResult {
  account: PropFirmAccountRecord;
  riskProfile: RiskProfile;
  /** One-time credential payload for email/webhook delivery. Do not persist or log. */
  credentials: TraderLoginCredentials & { magicLink?: string };
  credentialsFingerprint: string;
  emails?: ProvisioningEmailResult;
}

/**
 * Resolve challenge rules from model type, account size, firm program, and overrides.
 */
export function resolveChallengeConfigForAccount(input: {
  propFirmId: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  customRules?: Record<string, unknown>;
  challengeConfigOverrides?: Partial<ChallengeConfigInput>;
  firmProgram?: Partial<import("@/lib/tenants").TenantProgram>;
  firmSettings?: import("@/types/firm-settings").PropFirmSettingsRecord;
}): ChallengeConfigInput {
  const filteredCustomRules = input.firmSettings
    ? filterAllowedPurchaseOverrides(input.firmSettings, input.customRules)
    : input.customRules;

  const base = resolveDefaultChallengeConfig({
    modelType: input.modelType,
    accountSize: input.accountSize,
    firmProgram: input.firmProgram,
    firmModelDefaults: input.firmSettings
      ? getModelDefaultsForType(input.firmSettings, input.modelType)
      : undefined,
    firmDefaultCustomRules: input.firmSettings?.defaultCustomRules,
    customRules: filteredCustomRules,
  });
  return mergeChallengeConfig(base, input.challengeConfigOverrides);
}

/** Hydrate in-memory risk profiles after cold start (idempotent). */
export async function ensureRiskEngineHydrated(): Promise<void> {
  if (!process.env.DATABASE_URL || listRiskProfiles().length > 0) return;

  const rows = await prisma.propFirmAccount.findMany({
    where: { status: { in: ["provisioned", "activated"] } },
    include: { challengeConfig: true, traderDemoAccount: true },
  });

  for (const row of rows) {
    if (!row.challengeConfig || !row.traderDemoAccount) continue;
    const account = serializePropFirmAccount(row);
    const challengeConfig: ChallengeConfigInput = {
      profitTarget: Number(row.challengeConfig.profitTarget),
      dailyDrawdown: Number(row.challengeConfig.dailyDrawdown),
      maxDrawdown: Number(row.challengeConfig.maxDrawdown),
      maxBetSizeValue: Number(row.challengeConfig.maxBetSizeValue),
      maxBetSizeMode: row.challengeConfig.maxBetSizeMode,
      consistencyScore:
        row.challengeConfig.consistencyScore === null
          ? null
          : Number(row.challengeConfig.consistencyScore),
      otherCustomRules: (row.challengeConfig.otherCustomRules ?? {}) as Record<
        string,
        unknown
      >,
    };

    registerRiskProfile(
      buildRiskProfile({
        propFirmAccountId: row.id,
        propFirmId: row.propFirmId,
        traderEmail: row.traderEmail,
        modelType: account.modelType,
        accountSize: account.accountSize,
        virtualBalance: Number(row.traderDemoAccount.virtualBalance),
        challengeConfig,
      }),
    );
  }
}

/**
 * Full automated provisioning flow:
 *
 * 1. Resolve challenge rules (model + size + firm + custom JSON)
 * 2. Create `PropFirmAccount` (pending) + `ChallengeConfig` + encrypted credentials
 * 3. Register rules on the in-process Risk Engine
 * 4. Send trader + prop firm emails
 * 5. Update status to `provisioned` (or `activated` when requested)
 * 6. Log event in Super Admin activity feed
 */
export async function provisionNewAccount(
  input: ProvisionNewAccountInput,
): Promise<ProvisionNewAccountResult> {
  await ensureSeeded();
  await ensureRiskEngineHydrated();

  const source = input.source ?? "job";
  let auditBase: ProvisioningAuditBase | null = null;

  try {
    const data = provisionNewAccountSchema.parse({
      propFirmId: input.propFirmId,
      traderEmail: input.traderEmail,
      modelType: input.modelType,
      accountSize: input.accountSize,
      purchasedAt: input.purchasedAt,
      customRules: input.customRules,
      challengeConfigOverrides: input.challengeConfigOverrides,
      loginMode: input.loginMode,
      activateImmediately: input.activateImmediately,
      sendEmails: input.sendEmails,
    });

    const traderEmail = data.traderEmail.toLowerCase();
    auditBase = {
      propFirmId: data.propFirmId,
      traderEmail,
      modelType: data.modelType,
      accountSize: data.accountSize,
      source,
      apiKeyId: input.auditContext?.apiKeyId,
      actorUserId: input.auditContext?.actorUserId ?? input.provisionedBy,
      ipAddress: input.auditContext?.ipAddress ?? null,
    };

    const firm = await prisma.tenant.findUnique({ where: { id: data.propFirmId } });
    if (!firm) {
      throw new ProvisioningError({
        code: "FIRM_NOT_FOUND",
        message: "Prop firm not found.",
        userMessage: "The selected prop firm does not exist or is inactive.",
        status: 404,
      });
    }

    const firmConfig = tenantRowToConfig(firm);
    const firmSettings = await getOrCreateFirmSettings(data.propFirmId, firmConfig.program);

    validateProvisioningAgainstSettings(firmSettings, data.modelType, data.accountSize);

    const challengeConfig = resolveChallengeConfigForAccount({
      propFirmId: data.propFirmId,
      modelType: data.modelType,
      accountSize: data.accountSize,
      customRules: data.customRules,
      challengeConfigOverrides: data.challengeConfigOverrides,
      firmProgram: firmConfig.program,
      firmSettings,
    });

    const virtualBalance = defaultVirtualBalance(data.accountSize);
    const now = new Date();

    // Step 1–2: Create account shell, challenge config, and encrypted credentials.
  const row = await prisma.$transaction(async (tx) => {
    const account = await tx.propFirmAccount.create({
      data: {
        propFirmId: data.propFirmId,
        traderEmail,
        modelType: fromApiModelType(data.modelType),
        accountSize: fromApiAccountSize(data.accountSize),
        purchasedAt: data.purchasedAt ?? now,
        status: "pending",
        challengeConfig: {
          create: {
            profitTarget: challengeConfig.profitTarget,
            dailyDrawdown: challengeConfig.dailyDrawdown,
            maxDrawdown: challengeConfig.maxDrawdown,
            maxBetSizeValue: challengeConfig.maxBetSizeValue,
            maxBetSizeMode: fromApiMaxBetMode(challengeConfig.maxBetSizeMode ?? "percent"),
            consistencyScore: challengeConfig.consistencyScore ?? null,
            otherCustomRules: (challengeConfig.otherCustomRules ??
              {}) as Prisma.InputJsonValue,
          },
        },
      },
      include: { challengeConfig: true },
    });

    if (!account.challengeConfig) {
      throw new Error("Challenge config was not created.");
    }

    const generated = await generateLoginCredentials({
      traderEmail,
      propFirmAccountId: account.id,
      tenantSlug: firm.slug,
      mode: data.loginMode,
    });

    const encrypted = encryptLoginCredentials(generated.delivery);

    await tx.traderDemoAccount.create({
      data: {
        propFirmAccountId: account.id,
        challengeConfigId: account.challengeConfig.id,
        virtualBalance,
        loginCredentials: encrypted,
      },
    });

    const full = await tx.propFirmAccount.findUniqueOrThrow({
      where: { id: account.id },
      include: accountInclude,
    });

    return { row: full, generated };
  });

  let accountRecord = serializePropFirmAccount(row.row);

  // Step 3: Apply challenge rules to the Risk Engine.
  const riskProfile = registerRiskProfile(
    buildRiskProfile({
      propFirmAccountId: row.row.id,
      propFirmId: data.propFirmId,
      traderEmail,
      modelType: data.modelType,
      accountSize: data.accountSize,
      virtualBalance,
      challengeConfig,
    }),
  );

  // Step 4: Send provisioning emails.
  let emails: ProvisioningEmailResult | undefined;
  const shouldSendEmails = data.sendEmails !== false;

  if (shouldSendEmails) {
    try {
      emails = await sendProvisioningEmails({
        account: accountRecord,
        credentials: row.generated.delivery,
        firmName: firmConfig.name,
        propFirmId: data.propFirmId,
        virtualBalance,
        challengeConfig,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed";
      await logAccountProvisioningFailed({
        tenantId: data.propFirmId,
        tenantName: firmConfig.name,
        traderEmail,
        error: message,
        source,
      });
      throw error;
    }
  }

  // Step 5: Finalize account status.
  const finalStatus = data.activateImmediately ? "activated" : "provisioned";
  const credentialsSentAt = emails?.trader.sent ? new Date() : null;

  const updated = await prisma.propFirmAccount.update({
    where: { id: row.row.id },
    data: {
      status: finalStatus,
      credentialsSentAt,
    },
    include: accountInclude,
  });

  accountRecord = serializePropFirmAccount(updated);

  // Step 6: Super Admin activity log.
  if (!input.skipActivityLog) {
    await logAccountProvisioned({
      tenantId: data.propFirmId,
      tenantName: firmConfig.name,
      traderEmail,
      accountSize: data.accountSize,
      modelType: data.modelType,
      accountId: accountRecord.id,
      source,
      async: false,
    });
  }

    const fingerprint = credentialsFingerprint(
      row.generated.delivery.password ?? row.row.id,
    );

    await logProvisioningAudit({
      ...auditBase!,
      status: "success",
      propFirmAccountId: accountRecord.id,
      credentialsFingerprint: fingerprint,
    });

    return {
      account: accountRecord,
      riskProfile,
      credentials: row.generated.delivery,
      credentialsFingerprint: fingerprint,
      emails,
    };
  } catch (error) {
    if (auditBase) {
      const body = provisioningErrorBody(error);
      await logProvisioningAudit({
        ...auditBase,
        status: "failed",
        errorCode: body.code,
        errorMessage: body.error,
      });
    }
    throw error;
  }
}

/** Re-apply stored challenge config to the risk engine (e.g. after server restart). */
export async function syncRiskProfileFromDatabase(
  propFirmAccountId: string,
): Promise<RiskProfile | null> {
  const row = await prisma.propFirmAccount.findUnique({
    where: { id: propFirmAccountId },
    include: { challengeConfig: true, traderDemoAccount: true },
  });

  if (!row?.challengeConfig || !row.traderDemoAccount) return null;

  const account = serializePropFirmAccount(row);
  const challengeConfig: ChallengeConfigInput = {
    profitTarget: Number(row.challengeConfig.profitTarget),
    dailyDrawdown: Number(row.challengeConfig.dailyDrawdown),
    maxDrawdown: Number(row.challengeConfig.maxDrawdown),
    maxBetSizeValue: Number(row.challengeConfig.maxBetSizeValue),
    maxBetSizeMode: row.challengeConfig.maxBetSizeMode,
    consistencyScore:
      row.challengeConfig.consistencyScore === null
        ? null
        : Number(row.challengeConfig.consistencyScore),
    otherCustomRules: (row.challengeConfig.otherCustomRules ?? {}) as Record<
      string,
      unknown
    >,
  };

  return registerRiskProfile(
    buildRiskProfile({
      propFirmAccountId: row.id,
      propFirmId: row.propFirmId,
      traderEmail: row.traderEmail,
      modelType: account.modelType,
      accountSize: account.accountSize,
      virtualBalance: Number(row.traderDemoAccount.virtualBalance),
      challengeConfig,
    }),
  );
}

export {
  mergeChallengeConfig,
  resolveDefaultChallengeConfig,
} from "@/lib/provisioning/default-rules";
