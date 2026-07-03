/**
 * Account provisioning orchestration service.
 *
 * Equivalent of the requested `backend/services/account_provisioning.py` for the
 * Next.js / Prisma stack. Call from webhooks, Super Admin API routes, or
 * internal jobs to fully automate sold-account setup.
 *
 * @example Webhook handler
 * ```ts
 * import { provisionNewAccount } from "@/services/account-provisioning";
 *
 * const result = await provisionNewAccount({
 *   propFirmId: firm.id,
 *   traderEmail: payload.email,
 *   modelType: "2step",
 *   accountSize: "100K",
 *   customRules: payload.rules,
 * });
 * // Deliver result.credentials once via email — never log the password.
 * ```
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildRiskProfile,
  registerRiskProfile,
  type RiskProfile,
} from "@/lib/engine/risk";
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
import { tenantRowToConfig } from "@/lib/tenant-db";
import { provisionNewAccountSchema } from "@/lib/schemas/provisioning";
import type {
  AccountSize,
  ChallengeConfigInput,
  PropFirmAccountRecord,
  PropFirmModelType,
  TraderLoginCredentials,
} from "@/types/provisioning";

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
  /** Mark account activated and set credentialsSentAt after provisioning. */
  activateImmediately?: boolean;
}

export interface ProvisionNewAccountResult {
  account: PropFirmAccountRecord;
  riskProfile: RiskProfile;
  /** One-time credential payload for email/webhook delivery. Do not persist or log. */
  credentials: TraderLoginCredentials & { magicLink?: string };
  credentialsFingerprint: string;
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
}): ChallengeConfigInput {
  const base = resolveDefaultChallengeConfig({
    modelType: input.modelType,
    accountSize: input.accountSize,
    firmProgram: input.firmProgram,
    customRules: input.customRules,
  });
  return mergeChallengeConfig(base, input.challengeConfigOverrides);
}

/**
 * Full automated provisioning flow:
 *
 * 1. Resolve challenge rules (model + size + firm + custom JSON)
 * 2. Create `PropFirmAccount` + `ChallengeConfig`
 * 3. Generate secure credentials (password or magic link)
 * 4. Create `TraderDemoAccount` with virtual balance
 * 5. Register rules on the in-process Risk Engine
 */
export async function provisionNewAccount(
  input: ProvisionNewAccountInput,
): Promise<ProvisionNewAccountResult> {
  await ensureSeeded();

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
  });

  const firm = await prisma.tenant.findUnique({ where: { id: data.propFirmId } });
  if (!firm) {
    throw new Error("Prop firm not found.");
  }

  const firmConfig = tenantRowToConfig(firm);
  const challengeConfig = resolveChallengeConfigForAccount({
    propFirmId: data.propFirmId,
    modelType: data.modelType,
    accountSize: data.accountSize,
    customRules: data.customRules,
    challengeConfigOverrides: data.challengeConfigOverrides,
    firmProgram: firmConfig.program,
  });

  const virtualBalance = defaultVirtualBalance(data.accountSize);
  const traderEmail = data.traderEmail.toLowerCase();
  const now = new Date();
  const status = data.activateImmediately ? "activated" : "provisioned";

  const row = await prisma.$transaction(async (tx) => {
    const account = await tx.propFirmAccount.create({
      data: {
        propFirmId: data.propFirmId,
        traderEmail,
        modelType: fromApiModelType(data.modelType),
        accountSize: fromApiAccountSize(data.accountSize),
        purchasedAt: data.purchasedAt ?? now,
        status,
        credentialsSentAt: data.activateImmediately ? now : null,
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

  const accountRecord = serializePropFirmAccount(row.row);

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

  return {
    account: accountRecord,
    riskProfile,
    credentials: row.generated.delivery,
    credentialsFingerprint: credentialsFingerprint(
      row.generated.delivery.password ?? row.row.id,
    ),
  };
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
