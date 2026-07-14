/**
 * Maps Prisma provisioning models to API-safe records.
 */

import type {
  AccountSize,
  ChallengeConfig as PrismaChallengeConfig,
  PropFirmAccount as PrismaPropFirmAccount,
  PropFirmAccountStatus,
  PropFirmModelType,
  TraderDemoAccount as PrismaTraderDemoAccount,
  MaxBetSizeMode,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import type {
  AccountSize as ApiAccountSize,
  ChallengeConfigRecord,
  PropFirmAccountRecord,
  PropFirmAccountStatus as ApiStatus,
  PropFirmModelType as ApiModelType,
  MaxBetSizeMode as ApiMaxBetSizeMode,
  TraderDemoAccountRecord,
} from "@/types/provisioning";

const MODEL_TYPE_TO_API: Record<PropFirmModelType, ApiModelType> = {
  one_step: "1step",
  two_step: "2step",
  three_step: "3step",
  instant: "instant",
};

const MODEL_TYPE_FROM_API: Record<ApiModelType, PropFirmModelType> = {
  "1step": "one_step",
  "2step": "two_step",
  "3step": "three_step",
  instant: "instant",
};

const ACCOUNT_SIZE_TO_API: Record<AccountSize, ApiAccountSize> = {
  size_10k: "10K",
  size_25k: "25K",
  size_50k: "50K",
  size_100k: "100K",
  size_500k: "500K",
  size_1m: "1M",
  size_2m: "2M",
};

const ACCOUNT_SIZE_FROM_API: Record<ApiAccountSize, AccountSize> = {
  "10K": "size_10k",
  "25K": "size_25k",
  "50K": "size_50k",
  "100K": "size_100k",
  "500K": "size_500k",
  "1M": "size_1m",
  "2M": "size_2m",
};

const STATUS_TO_API: Record<PropFirmAccountStatus, ApiStatus> = {
  pending: "pending",
  provisioned: "provisioned",
  activated: "activated",
  expired: "expired",
};

const STATUS_FROM_API: Record<ApiStatus, PropFirmAccountStatus> = {
  pending: "pending",
  provisioned: "provisioned",
  activated: "activated",
  expired: "expired",
};

const MAX_BET_MODE_TO_API: Record<MaxBetSizeMode, ApiMaxBetSizeMode> = {
  percent: "percent",
  fixed: "fixed",
};

const MAX_BET_MODE_FROM_API: Record<ApiMaxBetSizeMode, MaxBetSizeMode> = {
  percent: "percent",
  fixed: "fixed",
};

function decimalToNumber(value: Decimal | number | string): number {
  if (value instanceof Decimal) return value.toNumber();
  return Number(value);
}

export function toApiModelType(value: PropFirmModelType): ApiModelType {
  return MODEL_TYPE_TO_API[value];
}

export function fromApiModelType(value: ApiModelType): PropFirmModelType {
  return MODEL_TYPE_FROM_API[value];
}

export function toApiAccountSize(value: AccountSize): ApiAccountSize {
  return ACCOUNT_SIZE_TO_API[value];
}

export function fromApiAccountSize(value: ApiAccountSize): AccountSize {
  return ACCOUNT_SIZE_FROM_API[value];
}

export function toApiStatus(value: PropFirmAccountStatus): ApiStatus {
  return STATUS_TO_API[value];
}

export function fromApiStatus(value: ApiStatus): PropFirmAccountStatus {
  return STATUS_FROM_API[value];
}

export function toApiMaxBetMode(value: MaxBetSizeMode): ApiMaxBetSizeMode {
  return MAX_BET_MODE_TO_API[value];
}

export function fromApiMaxBetMode(value: ApiMaxBetSizeMode): MaxBetSizeMode {
  return MAX_BET_MODE_FROM_API[value];
}

export function serializeChallengeConfig(row: PrismaChallengeConfig): ChallengeConfigRecord {
  return {
    id: row.id,
    propFirmAccountId: row.propFirmAccountId,
    profitTarget: decimalToNumber(row.profitTarget),
    dailyDrawdown: decimalToNumber(row.dailyDrawdown),
    maxDrawdown: decimalToNumber(row.maxDrawdown),
    maxBetSizeValue: decimalToNumber(row.maxBetSizeValue),
    maxBetSizeMode: toApiMaxBetMode(row.maxBetSizeMode),
    consistencyScore:
      row.consistencyScore === null ? null : decimalToNumber(row.consistencyScore),
    otherCustomRules: (row.otherCustomRules ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeTraderDemoAccount(row: PrismaTraderDemoAccount): TraderDemoAccountRecord {
  return {
    id: row.id,
    propFirmAccountId: row.propFirmAccountId,
    challengeConfigId: row.challengeConfigId,
    virtualBalance: decimalToNumber(row.virtualBalance),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type PropFirmAccountWithRelations = PrismaPropFirmAccount & {
  challengeConfig?: PrismaChallengeConfig | null;
  traderDemoAccount?: PrismaTraderDemoAccount | null;
};

export function serializePropFirmAccount(row: PropFirmAccountWithRelations): PropFirmAccountRecord {
  return {
    id: row.id,
    propFirmId: row.propFirmId,
    traderEmail: row.traderEmail,
    modelType: toApiModelType(row.modelType),
    accountSize: toApiAccountSize(row.accountSize),
    status: toApiStatus(row.status),
    purchasedAt: row.purchasedAt.toISOString(),
    credentialsSentAt: row.credentialsSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    challengeConfig: row.challengeConfig ? serializeChallengeConfig(row.challengeConfig) : null,
    traderDemoAccount: row.traderDemoAccount
      ? serializeTraderDemoAccount(row.traderDemoAccount)
      : null,
  };
}

/** Default virtual balance from account size tier (USD). */
export function defaultVirtualBalance(size: ApiAccountSize): number {
  const map: Record<ApiAccountSize, number> = {
    "10K": 10_000,
    "25K": 25_000,
    "50K": 50_000,
    "100K": 100_000,
    "500K": 500_000,
    "1M": 1_000_000,
    "2M": 2_000_000,
  };
  return map[size];
}
