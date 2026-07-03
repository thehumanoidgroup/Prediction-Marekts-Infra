import { prisma } from "@/lib/db";
import { getPlatformActivityFeed, recordPlatformActivity } from "@/lib/store";
import type { PlatformActivity, PlatformActivityType } from "@/lib/types";

export interface LogPlatformActivityInput {
  type: PlatformActivityType;
  tenantId?: string | null;
  tenantName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Persist an activity event and mirror it to the in-memory feed for immediate UI updates. */
export async function logPlatformActivity(
  input: LogPlatformActivityInput,
): Promise<PlatformActivity> {
  const ts = Date.now();
  const item: PlatformActivity = {
    id: `act-${ts}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    tenantId: input.tenantId ?? null,
    tenantName: input.tenantName ?? null,
    message: input.message,
    ts,
  };

  recordPlatformActivity(item);

  if (process.env.DATABASE_URL) {
    try {
      const row = await prisma.platformActivityLog.create({
        data: {
          id: item.id,
          type: input.type,
          tenantId: input.tenantId ?? null,
          tenantName: input.tenantName ?? null,
          message: input.message,
          metadata: (input.metadata ?? {}) as object,
        },
      });
      item.id = row.id;
      item.ts = row.createdAt.getTime();
    } catch (error) {
      console.error("[activity] Failed to persist platform activity:", error);
    }
  }

  return item;
}

function rowToActivity(row: {
  id: string;
  type: string;
  tenantId: string | null;
  tenantName: string | null;
  message: string;
  createdAt: Date;
}): PlatformActivity {
  return {
    id: row.id,
    type: row.type as PlatformActivityType,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    message: row.message,
    ts: row.createdAt.getTime(),
  };
}

/** Merge durable DB events with the seeded in-memory activity feed. */
export async function getMergedPlatformActivity(limit = 50): Promise<PlatformActivity[]> {
  const memory = getPlatformActivityFeed();
  if (!process.env.DATABASE_URL) {
    return memory.slice(0, limit);
  }

  try {
    const rows = await prisma.platformActivityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const dbItems = rows.map(rowToActivity);
    const seen = new Set(dbItems.map((item) => item.id));
    const merged = [
      ...dbItems,
      ...memory.filter((item) => !seen.has(item.id)),
    ].sort((a, b) => b.ts - a.ts);
    return merged.slice(0, limit);
  } catch {
    return memory.slice(0, limit);
  }
}

export async function logAccountProvisioned(input: {
  tenantId: string;
  tenantName: string;
  traderEmail: string;
  accountSize: string;
  modelType: string;
  accountId: string;
  source: "webhook" | "manual" | "job";
  async: boolean;
}): Promise<void> {
  await logPlatformActivity({
    type: "account_provisioned",
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    message: `${input.accountSize} ${input.modelType} account provisioned for ${input.traderEmail}${input.async ? " (queued)" : ""}`,
    metadata: {
      accountId: input.accountId,
      source: input.source,
      traderEmail: input.traderEmail,
      accountSize: input.accountSize,
      modelType: input.modelType,
    },
  });
}

export async function logAccountProvisioningFailed(input: {
  tenantId?: string;
  tenantName?: string;
  traderEmail: string;
  error: string;
  jobId?: string;
  source: "webhook" | "manual" | "job";
}): Promise<void> {
  await logPlatformActivity({
    type: "account_provisioning_failed",
    tenantId: input.tenantId ?? null,
    tenantName: input.tenantName ?? null,
    message: `Provisioning failed for ${input.traderEmail}: ${input.error}`,
    metadata: {
      jobId: input.jobId,
      source: input.source,
      traderEmail: input.traderEmail,
      error: input.error,
    },
  });
}
