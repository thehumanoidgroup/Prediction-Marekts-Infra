/**
 * Durable trader portfolio persistence for the Vercel single-app deployment.
 *
 * In-memory store remains the hot path; Prisma keeps balances, positions,
 * orders, and journal entries across serverless cold starts.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getTenantState,
  isTenantHydrated,
  listExternalMarkets,
  markTenantHydrated,
  restoreExternalMarkets,
  setTenantState,
} from "@/lib/store";
import type { ChallengeAccount, JournalEntry, Market, Order, Position } from "@/lib/types";

const SCOPE = "default";

interface PersistedAccount {
  id: string;
  label: string;
  phase: ChallengeAccount["phase"];
  startingBalance: number;
  balance: number;
  equity: number;
  dailyPnl: number;
  totalPnl: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  profitTargetPct: number;
  daysTraded: number;
  minTradingDays: number;
  startedAt: number;
  objectives: ChallengeAccount["objectives"];
  equityCurve: ChallengeAccount["equityCurve"];
  provider?: ChallengeAccount["provider"];
}

function decimalToNumber(value: { toNumber?: () => number } | number | string): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value.toNumber === "function") return value.toNumber();
  return Number(value);
}

/** Load durable portfolio into memory when present. No-op without DATABASE_URL. */
export async function hydrateTenantPortfolio(tenantId: string): Promise<void> {
  if (!process.env.DATABASE_URL || isTenantHydrated(tenantId)) return;

  try {
    const row = await prisma.traderPortfolio.findUnique({
      where: { tenantId_scopeKey: { tenantId, scopeKey: SCOPE } },
    });

    if (!row) {
      markTenantHydrated(tenantId);
      return;
    }

    const positions = (row.positions as unknown as Position[]) ?? [];
    const orders = (row.orders as unknown as Order[]) ?? [];
    const journal = (row.journal as unknown as JournalEntry[]) ?? [];
    const markets = (row.markets as unknown as Market[]) ?? [];
    const accountSnap = (row.account as unknown as PersistedAccount) ?? null;
    const memory = getTenantState(tenantId);

    const account: ChallengeAccount = {
      ...memory.account,
      ...(accountSnap ?? {}),
      balance: decimalToNumber(row.balance),
      equity: decimalToNumber(row.equity),
      objectives: accountSnap?.objectives ?? memory.account.objectives,
      equityCurve: accountSnap?.equityCurve ?? memory.account.equityCurve,
    };

    restoreExternalMarkets(markets);
    setTenantState(tenantId, {
      account,
      positions,
      orders,
      journal,
    });
  } catch (error) {
    console.error("[portfolio] hydrate failed:", error);
    markTenantHydrated(tenantId);
  }
}

/** Persist current in-memory portfolio for a tenant. */
export async function persistTenantPortfolio(tenantId: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    const state = getTenantState(tenantId);
    const external = listExternalMarkets().filter((market) =>
      state.positions.some((pos) => pos.marketId === market.id) ||
      state.orders.some((order) => order.marketId === market.id),
    );

    const account: PersistedAccount = {
      id: state.account.id,
      label: state.account.label,
      phase: state.account.phase,
      startingBalance: state.account.startingBalance,
      balance: state.account.balance,
      equity: state.account.equity,
      dailyPnl: state.account.dailyPnl,
      totalPnl: state.account.totalPnl,
      maxDailyLossPct: state.account.maxDailyLossPct,
      maxDrawdownPct: state.account.maxDrawdownPct,
      profitTargetPct: state.account.profitTargetPct,
      daysTraded: state.account.daysTraded,
      minTradingDays: state.account.minTradingDays,
      startedAt: state.account.startedAt,
      objectives: state.account.objectives,
      equityCurve: state.account.equityCurve,
      provider: state.account.provider,
    };

    const payload = {
      balance: state.account.balance,
      equity: state.account.equity,
      positions: state.positions as unknown as Prisma.InputJsonValue,
      orders: state.orders as unknown as Prisma.InputJsonValue,
      journal: state.journal as unknown as Prisma.InputJsonValue,
      account: account as unknown as Prisma.InputJsonValue,
      markets: external as unknown as Prisma.InputJsonValue,
    };

    await prisma.traderPortfolio.upsert({
      where: { tenantId_scopeKey: { tenantId, scopeKey: SCOPE } },
      create: {
        tenantId,
        scopeKey: SCOPE,
        ...payload,
      },
      update: payload,
    });
    markTenantHydrated(tenantId);
  } catch (error) {
    console.error("[portfolio] persist failed:", error);
  }
}
