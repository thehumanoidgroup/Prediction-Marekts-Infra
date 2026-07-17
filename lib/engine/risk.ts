/**
 * In-process risk engine for provisioned evaluation accounts.
 *
 * Registers challenge rules when accounts are provisioned and enforces
 * stake / exposure limits on orders. Stored on `globalThis` to survive
 * dev HMR (mirrors `lib/store.ts`).
 */

import type { DrawdownMode } from "@/lib/tenants";
import type { ChallengeConfigInput } from "@/types/provisioning";
import type { AccountSize, PropFirmModelType } from "@/types/provisioning";

export interface RiskProfile {
  propFirmAccountId: string;
  propFirmId: string;
  traderEmail: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  virtualBalance: number;
  profitTargetPct: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxBetSizeValue: number;
  maxBetSizeMode: "percent" | "fixed";
  maxExposurePerMarket: number;
  minTradingDays: number;
  challengeDurationDays: number;
  drawdownMode: DrawdownMode;
  consistencyScore: number | null;
  customRules: Record<string, unknown>;
  registeredAt: number;
}

export interface OrderRiskInput {
  orderCostUsd: number;
  marketExposureUsd: number;
}

export interface RiskValidationResult {
  allowed: boolean;
  reason?: string;
}

interface RiskEngineState {
  profiles: Map<string, RiskProfile>;
}

const GLOBAL_KEY = "__pp_risk_engine__";

function getState(): RiskEngineState {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: RiskEngineState };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { profiles: new Map() };
  }
  return g[GLOBAL_KEY]!;
}

/** Register or replace the risk profile for a provisioned account. */
export function registerRiskProfile(profile: RiskProfile): RiskProfile {
  getState().profiles.set(profile.propFirmAccountId, profile);
  return profile;
}

export function getRiskProfile(propFirmAccountId: string): RiskProfile | undefined {
  return getState().profiles.get(propFirmAccountId);
}

export function removeRiskProfile(propFirmAccountId: string): void {
  getState().profiles.delete(propFirmAccountId);
}

/** Build a RiskProfile from a resolved challenge config + account metadata. */
export function buildRiskProfile(input: {
  propFirmAccountId: string;
  propFirmId: string;
  traderEmail: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  virtualBalance: number;
  challengeConfig: ChallengeConfigInput;
}): RiskProfile {
  const rules = input.challengeConfig.otherCustomRules ?? {};
  return {
    propFirmAccountId: input.propFirmAccountId,
    propFirmId: input.propFirmId,
    traderEmail: input.traderEmail.toLowerCase(),
    modelType: input.modelType,
    accountSize: input.accountSize,
    virtualBalance: input.virtualBalance,
    profitTargetPct: input.challengeConfig.profitTarget,
    maxDailyLossPct: input.challengeConfig.dailyDrawdown,
    maxDrawdownPct: input.challengeConfig.maxDrawdown,
    maxBetSizeValue: input.challengeConfig.maxBetSizeValue,
    maxBetSizeMode: input.challengeConfig.maxBetSizeMode ?? "percent",
    maxExposurePerMarket: Number(rules.maxExposurePerMarket ?? input.virtualBalance * 0.05),
    minTradingDays: Number(rules.minTradingDays ?? 10),
    challengeDurationDays: Number(rules.challengeDurationDays ?? 60),
    drawdownMode: (rules.drawdownMode as DrawdownMode) ?? "static",
    consistencyScore: input.challengeConfig.consistencyScore ?? null,
    customRules: rules,
    registeredAt: Date.now(),
  };
}

function maxBetAllowedUsd(profile: RiskProfile): number {
  if (profile.maxBetSizeMode === "fixed") {
    return profile.maxBetSizeValue;
  }
  return (profile.maxBetSizeValue / 100) * profile.virtualBalance;
}

/**
 * Validate an order against registered challenge rules.
 * Call from the order placement path when a provisioned account id is known.
 */
export function validateOrderRisk(
  propFirmAccountId: string,
  input: OrderRiskInput,
): RiskValidationResult {
  const profile = getRiskProfile(propFirmAccountId);
  if (!profile) {
    return { allowed: true };
  }

  const maxBet = maxBetAllowedUsd(profile);
  if (input.orderCostUsd > maxBet) {
    return {
      allowed: false,
      reason: `Order cost $${input.orderCostUsd.toFixed(2)} exceeds max bet $${maxBet.toFixed(2)}`,
    };
  }

  if (input.marketExposureUsd > profile.maxExposurePerMarket) {
    return {
      allowed: false,
      reason: `Market exposure $${input.marketExposureUsd.toFixed(2)} exceeds limit $${profile.maxExposurePerMarket.toFixed(2)}`,
    };
  }

  return { allowed: true };
}

/** List all registered profiles (Super Admin diagnostics). */
export function listRiskProfiles(propFirmId?: string): RiskProfile[] {
  const profiles = [...getState().profiles.values()];
  return propFirmId ? profiles.filter((p) => p.propFirmId === propFirmId) : profiles;
}

/** Test helper — wipe in-memory profiles between cases. */
export function clearRiskProfilesForTests(): void {
  getState().profiles.clear();
}
