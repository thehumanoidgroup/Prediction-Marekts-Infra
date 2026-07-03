/**
 * Service layer for automated prop firm account provisioning.
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { encryptLoginCredentials } from "@/lib/provisioning/crypto";
import {
  defaultVirtualBalance,
  fromApiAccountSize,
  fromApiMaxBetMode,
  fromApiModelType,
  fromApiStatus,
  serializePropFirmAccount,
} from "@/lib/provisioning/serialize";
import type { PropFirmAccountCreateInput } from "@/lib/schemas/provisioning";
import {
  propFirmAccountCreateSchema,
  propFirmAccountStatusUpdateSchema,
  provisionTraderDemoAccountSchema,
} from "@/lib/schemas/provisioning";
import type { PropFirmAccountRecord } from "@/types/provisioning";

const accountInclude = {
  challengeConfig: true,
  traderDemoAccount: true,
} as const;

export async function createPropFirmAccount(
  input: PropFirmAccountCreateInput,
): Promise<PropFirmAccountRecord> {
  const data = propFirmAccountCreateSchema.parse(input);

  const firm = await prisma.tenant.findUnique({ where: { id: data.propFirmId } });
  if (!firm) {
    throw new Error("Prop firm not found.");
  }

  const row = await prisma.propFirmAccount.create({
    data: {
      propFirmId: data.propFirmId,
      traderEmail: data.traderEmail.toLowerCase(),
      modelType: fromApiModelType(data.modelType),
      accountSize: fromApiAccountSize(data.accountSize),
      purchasedAt: data.purchasedAt ?? new Date(),
      challengeConfig: {
        create: {
          profitTarget: data.challengeConfig.profitTarget,
          dailyDrawdown: data.challengeConfig.dailyDrawdown,
          maxDrawdown: data.challengeConfig.maxDrawdown,
          maxBetSizeValue: data.challengeConfig.maxBetSizeValue,
          maxBetSizeMode: fromApiMaxBetMode(data.challengeConfig.maxBetSizeMode ?? "percent"),
          consistencyScore: data.challengeConfig.consistencyScore ?? null,
          otherCustomRules: (data.challengeConfig.otherCustomRules ??
            {}) as Prisma.InputJsonValue,
        },
      },
    },
    include: accountInclude,
  });

  return serializePropFirmAccount(row);
}

export async function getPropFirmAccount(id: string): Promise<PropFirmAccountRecord | null> {
  const row = await prisma.propFirmAccount.findUnique({
    where: { id },
    include: accountInclude,
  });
  return row ? serializePropFirmAccount(row) : null;
}

export async function listPropFirmAccountsByFirm(
  propFirmId: string,
  options: { status?: string } = {},
): Promise<PropFirmAccountRecord[]> {
  const rows = await prisma.propFirmAccount.findMany({
    where: {
      propFirmId,
      ...(options.status
        ? { status: fromApiStatus(options.status as PropFirmAccountRecord["status"]) }
        : {}),
    },
    include: accountInclude,
    orderBy: { purchasedAt: "desc" },
  });
  return rows.map(serializePropFirmAccount);
}

export async function updatePropFirmAccountStatus(
  id: string,
  input: { status: PropFirmAccountRecord["status"]; credentialsSentAt?: Date | null },
): Promise<PropFirmAccountRecord> {
  const data = propFirmAccountStatusUpdateSchema.parse(input);

  const row = await prisma.propFirmAccount.update({
    where: { id },
    data: {
      status: fromApiStatus(data.status),
      credentialsSentAt: data.credentialsSentAt,
    },
    include: accountInclude,
  });

  return serializePropFirmAccount(row);
}

export async function provisionTraderDemoAccount(
  input: Parameters<typeof provisionTraderDemoAccountSchema.parse>[0],
): Promise<PropFirmAccountRecord> {
  const data = provisionTraderDemoAccountSchema.parse(input);

  const account = await prisma.propFirmAccount.findUnique({
    where: { id: data.propFirmAccountId },
    include: { challengeConfig: true, traderDemoAccount: true },
  });

  if (!account) {
    throw new Error("Prop firm account not found.");
  }
  if (!account.challengeConfig) {
    throw new Error("Challenge config missing for account.");
  }
  if (account.traderDemoAccount) {
    throw new Error("Trader demo account already provisioned.");
  }

  const encrypted = encryptLoginCredentials(data.loginCredentials);

  const row = await prisma.$transaction(async (tx) => {
    await tx.traderDemoAccount.create({
      data: {
        propFirmAccountId: account.id,
        challengeConfigId: account.challengeConfig!.id,
        virtualBalance: data.virtualBalance,
        loginCredentials: encrypted,
      },
    });

    return tx.propFirmAccount.update({
      where: { id: account.id },
      data: { status: "provisioned" },
      include: accountInclude,
    });
  });

  return serializePropFirmAccount(row);
}

export async function activatePropFirmAccount(id: string): Promise<PropFirmAccountRecord> {
  const account = await prisma.propFirmAccount.findUnique({
    where: { id },
    include: accountInclude,
  });

  if (!account?.traderDemoAccount) {
    throw new Error("Cannot activate account without a provisioned demo account.");
  }

  const row = await prisma.propFirmAccount.update({
    where: { id },
    data: {
      status: "activated",
      credentialsSentAt: new Date(),
    },
    include: accountInclude,
  });

  return serializePropFirmAccount(row);
}

export { defaultVirtualBalance };
