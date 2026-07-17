/**
 * Domain types for automated prop firm account provisioning.
 * Mirrors Prisma models in `prisma/schema.prisma`.
 */

export type PropFirmModelType = "1step" | "2step" | "3step" | "instant";

export type AccountSize = "10K" | "25K" | "50K" | "100K" | "500K" | "1M" | "2M";

export type PropFirmAccountStatus = "pending" | "provisioned" | "activated" | "expired";

export type MaxBetSizeMode = "percent" | "fixed";

/** Plain-text login payload encrypted at rest on TraderDemoAccount. */
export interface TraderLoginCredentials {
  username: string;
  password: string;
  loginUrl?: string;
}

export interface ChallengeConfigInput {
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  maxBetSizeValue: number;
  maxBetSizeMode?: MaxBetSizeMode;
  consistencyScore?: number | null;
  otherCustomRules?: Record<string, unknown>;
  /** Optional link to PropFirmChallengeTemplate for override tracking. */
  templateId?: string | null;
}

export interface PropFirmChallengeTemplateInput {
  propFirmId: string;
  modelType: PropFirmModelType;
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  maxBetSizePerPick: number;
  maxBetSizeMode?: MaxBetSizeMode;
  maxBetSizeRules?: Record<string, unknown> | null;
  consistencyScore?: number | null;
  minTradingDays?: number | null;
  otherRules?: Record<string, unknown>;
}

export interface PropFirmChallengeTemplateRecord {
  id: string;
  propFirmId: string;
  modelType: PropFirmModelType;
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  maxBetSizePerPick: number;
  maxBetSizeMode: MaxBetSizeMode;
  maxBetSizeRules: Record<string, unknown> | null;
  consistencyScore: number | null;
  minTradingDays: number | null;
  otherRules: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PropFirmAccountInput {
  propFirmId: string;
  traderEmail: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  purchasedAt?: Date;
  challengeConfig: ChallengeConfigInput;
}

export interface PropFirmAccountRecord {
  id: string;
  propFirmId: string;
  traderEmail: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  status: PropFirmAccountStatus;
  purchasedAt: string;
  credentialsSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  challengeConfig: ChallengeConfigRecord | null;
  traderDemoAccount: TraderDemoAccountRecord | null;
}

export interface ChallengeConfigRecord {
  id: string;
  propFirmAccountId: string;
  templateId?: string | null;
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  maxBetSizeValue: number;
  maxBetSizeMode: MaxBetSizeMode;
  consistencyScore: number | null;
  otherCustomRules: Record<string, unknown>;
  sp500Tickers?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface TraderDemoAccountRecord {
  id: string;
  propFirmAccountId: string;
  challengeConfigId: string;
  virtualBalance: number;
  /** Omitted in API responses — credentials are never returned after provisioning. */
  loginCredentials?: never;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisionNewAccountResult {
  account: PropFirmAccountRecord;
  riskProfile: import("@/lib/engine/risk").RiskProfile;
  credentials: TraderLoginCredentials & { magicLink?: string };
  credentialsFingerprint: string;
}
