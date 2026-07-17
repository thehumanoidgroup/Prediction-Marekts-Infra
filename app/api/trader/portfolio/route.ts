import { NextRequest, NextResponse } from "next/server";
import { getAccount, getPortfolioSummary, getPositions } from "@/services";
import { getTenantFromRequest, getTenantSlugFromRequest } from "@/lib/tenant-request";
import { prisma } from "@/lib/db";
import type { ChallengeAccount, LiveEvent } from "@/lib/types";
import type { EnrichedPosition } from "@/lib/services";
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

function positionsToEvents(positions: EnrichedPosition[]): LiveEvent[] {
  return positions.map((position) => {
    const yes = position.market.yesPrice;
    const source = position.market.source;
    return {
      id: position.market.id,
      externalId: position.market.externalConditionId ?? position.market.id,
      source,
      provider: source,
      category: position.market.category,
      status: position.market.status,
      question: position.market.question,
      probabilities: { yes, no: 1 - yes },
      yesPrice: yes,
      volume: position.market.volume,
      volume24h: position.market.volume24h,
      change24h: position.market.change24h,
      lastUpdated: new Date().toISOString(),
      stockTicker: position.market.stockTicker ?? null,
      strikePrice: position.market.strikePrice ?? null,
      expirationType: position.market.expirationType ?? null,
      expirationDate: position.market.expirationDate ?? null,
    };
  });
}

async function localPortfolioPayload(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  const account = await withProvisionedProvider(tenant.id, getAccount(tenant.id));
  const positions = getPositions(tenant.id);
  const summary = getPortfolioSummary(tenant.id);
  return {
    account,
    positions,
    summary: {
      ...summary,
      totalValue: summary.equity,
      positionsValue: positions.reduce((sum, p) => sum + p.value, 0),
      openPositions: positions.length,
      numberOfOpenPositions: positions.length,
    },
    events: positionsToEvents(positions),
  };
}

/**
 * Trader live portfolio BFF.
 *
 * Prefers FastAPI ``GET /api/trader/portfolio`` (provider-aware live marks +
 * TTL cache) when ``PP_API_URL`` / ``API_URL`` is configured; otherwise falls
 * back to the in-memory Next.js store used on Vercel-only deploys.
 */
export async function GET(request: NextRequest) {
  const backend = process.env.PP_API_URL ?? process.env.API_URL;
  const slug = getTenantSlugFromRequest(request);
  const auth = request.headers.get("authorization");

  if (backend) {
    try {
      const headers: Record<string, string> = {
        "X-Tenant-Slug": slug,
        Accept: "application/json",
      };
      if (auth) headers.Authorization = auth;

      const response = await fetch(`${backend.replace(/\/$/, "")}/api/trader/portfolio`, {
        headers,
        cache: "no-store",
      });
      if (response.ok) {
        const body = await response.json();
        return NextResponse.json(body);
      }
    } catch {
      // Fall through to local in-memory portfolio.
    }
  }

  return NextResponse.json(await localPortfolioPayload(request));
}
