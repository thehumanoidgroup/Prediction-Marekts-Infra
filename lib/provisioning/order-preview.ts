/** Order risk preview using the in-process risk engine (single-app deployment). */

import { prisma } from "@/lib/db";
import { validateOrderRisk } from "@/lib/engine/risk";
import { getPositions } from "@/lib/services";
import { ensureRiskEngineHydrated } from "@/services/account-provisioning";
import type { OrderRiskPreview, Outcome } from "@/types";

function estimateStake(
  outcome: Outcome,
  side: "buy" | "sell",
  shares: number,
  yesPrice: number,
): number {
  const price = outcome === "yes" ? yesPrice : 1 - yesPrice;
  return side === "buy" ? shares * price : shares * (1 - price);
}

export async function previewOrderRisk(input: {
  tenantId: string;
  marketId: string;
  outcome: Outcome;
  side: "buy" | "sell";
  shares: number;
  yesPrice: number;
}): Promise<OrderRiskPreview> {
  const stake = estimateStake(input.outcome, input.side, input.shares, input.yesPrice);
  const openOnMarket = getPositions(input.tenantId)
    .filter((p) => p.marketId === input.marketId)
    .reduce((sum, p) => sum + p.cost, 0);
  const projectedMarketExposure =
    input.side === "buy" ? openOnMarket + stake : Math.max(0, openOnMarket - stake);

  if (!process.env.DATABASE_URL) {
    return {
      allowed: true,
      reasons: [],
      violations: [],
      stake,
      side: input.side,
      projectedMarketExposure,
      projectedTotalExposure: projectedMarketExposure,
    };
  }

  await ensureRiskEngineHydrated();

  const account = await prisma.propFirmAccount.findFirst({
    where: {
      propFirmId: input.tenantId,
      status: { in: ["provisioned", "activated"] },
    },
    orderBy: { createdAt: "desc" },
    include: { challengeConfig: true, traderDemoAccount: true },
  });

  if (!account?.challengeConfig) {
    return {
      allowed: true,
      reasons: [],
      violations: [],
      stake,
      side: input.side,
      projectedMarketExposure,
      projectedTotalExposure: projectedMarketExposure,
    };
  }

  const rules = account.challengeConfig.otherCustomRules as Record<string, unknown>;
  const maxExposure = Number(rules.maxExposurePerMarket ?? stake * 2);
  const validation = validateOrderRisk(account.id, {
    orderCostUsd: stake,
    marketExposureUsd: projectedMarketExposure,
  });

  const violations = validation.allowed ? [] : [validation.reason ?? "Risk limit exceeded"];
  const virtualBalance = account.traderDemoAccount
    ? Number(account.traderDemoAccount.virtualBalance)
    : 0;
  const maxStake =
    account.challengeConfig.maxBetSizeMode === "fixed"
      ? Number(account.challengeConfig.maxBetSizeValue)
      : (Number(account.challengeConfig.maxBetSizeValue) / 100) * virtualBalance;

  return {
    allowed: validation.allowed,
    reasons: validation.allowed ? [] : violations,
    violations,
    stake,
    side: input.side,
    projectedMarketExposure,
    projectedTotalExposure: projectedMarketExposure,
    maxStakePerOrder: maxStake || null,
    maxExposurePerMarket: maxExposure,
    maxTotalExposure: null,
    challengeStatus: account.status,
  };
}
