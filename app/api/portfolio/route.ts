import { NextRequest, NextResponse } from "next/server";
import { getAccount, getPortfolioSummary, getPositions } from "@/services";
import { getTenantFromRequest } from "@/lib/tenant-request";
import { prisma } from "@/lib/db";
import type { ChallengeAccount } from "@/lib/types";
import { DEFAULT_SP500_TICKERS } from "@/lib/sp500/challenge-templates";

/**
 * Overlay provider / S&P ticker metadata from the latest provisioned account
 * so the trader dashboard can open the correct market board after issuance.
 */
async function withProvisionedProvider(
  tenantId: string,
  account: ChallengeAccount,
): Promise<ChallengeAccount> {
  if (!process.env.DATABASE_URL) return account;

  try {
    const row = await prisma.propFirmAccount.findFirst({
      where: {
        propFirmId: tenantId,
        status: { in: ["provisioned", "activated"] },
      },
      orderBy: { createdAt: "desc" },
      include: { challengeConfig: true, traderDemoAccount: true },
    });
    if (!row) return account;

    const rules = (row.challengeConfig?.otherCustomRules ?? {}) as Record<string, unknown>;
    const provider =
      (row.provider as ChallengeAccount["provider"]) ||
      (typeof rules.provider === "string"
        ? (rules.provider as ChallengeAccount["provider"])
        : undefined) ||
      account.provider;

    const sp500Tickers = Array.isArray(rules.sp500Tickers)
      ? (rules.sp500Tickers as string[])
      : Array.isArray(row.challengeConfig?.sp500Tickers)
        ? (row.challengeConfig?.sp500Tickers as string[])
        : provider === "sp500_dynamic"
          ? [...DEFAULT_SP500_TICKERS]
          : undefined;

    return {
      ...account,
      provider,
      sp500Tickers,
    };
  } catch {
    return account;
  }
}

export async function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  const account = await withProvisionedProvider(tenant.id, getAccount(tenant.id));

  return NextResponse.json({
    account,
    positions: getPositions(tenant.id),
    summary: getPortfolioSummary(tenant.id),
  });
}
