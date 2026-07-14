/**
 * Database-backed async provisioning queue.
 *
 * Equivalent to Celery/Redis for the Next.js stack. Set `PROVISIONING_ASYNC=true`
 * or pass `async: true` on webhook/manual payloads to enqueue instead of blocking.
 *
 * Optional Redis fan-out: set `REDIS_URL` to LPUSH job ids for external workers.
 */

import type { ProvisioningJobSource, ProvisioningJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ProvisionNewAccountInput } from "@/services/account-provisioning";

export type ProvisioningQueueMode = "sync" | "database";

export interface EnqueueProvisioningJobInput {
  payload: ProvisionNewAccountInput & {
    source?: "webhook" | "manual";
    provisionedBy?: string;
  };
  source: ProvisioningJobSource;
}

export interface ProvisioningJobSummary {
  id: string;
  status: ProvisioningJobStatus;
  source: ProvisioningJobSource;
  propFirmAccountId: string | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function getProvisioningQueueMode(): ProvisioningQueueMode {
  if (
    process.env.PROVISIONING_ASYNC === "true" ||
    process.env.PROVISIONING_QUEUE === "database"
  ) {
    return "database";
  }
  return "sync";
}

export function shouldUseAsyncQueue(requestAsync?: boolean): boolean {
  if (requestAsync === true) return true;
  if (requestAsync === false) return false;
  return getProvisioningQueueMode() === "database";
}

function serializeJob(row: {
  id: string;
  status: ProvisioningJobStatus;
  source: ProvisioningJobSource;
  propFirmAccountId: string | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): ProvisioningJobSummary {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    propFirmAccountId: row.propFirmAccountId,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** Enqueue a provisioning job and trigger the background worker. */
export async function enqueueProvisioningJob(
  input: EnqueueProvisioningJobInput,
): Promise<ProvisioningJobSummary> {
  const row = await prisma.provisioningJob.create({
    data: {
      source: input.source,
      payload: input.payload as object,
      status: "pending",
    },
  });

  scheduleProvisioningWorker(row.id);

  return serializeJob(row);
}

/** Fire-and-forget HTTP call to the internal worker route. */
export function scheduleProvisioningWorker(jobId: string): void {
  const baseUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  const secret = process.env.PROVISIONING_WORKER_SECRET;

  const run = async () => {
    try {
      await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/provisioning/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ jobId }),
      });
    } catch (error) {
      console.error("[provisioning] Worker trigger failed:", error);
    }
  };

  void run();
}

export async function getProvisioningJob(jobId: string): Promise<ProvisioningJobSummary | null> {
  const row = await prisma.provisioningJob.findUnique({ where: { id: jobId } });
  return row ? serializeJob(row) : null;
}

export async function claimNextProvisioningJob(jobId?: string) {
  if (jobId) {
    const existing = await prisma.provisioningJob.findUnique({ where: { id: jobId } });
    if (!existing || existing.status !== "pending") return null;
    return prisma.provisioningJob.update({
      where: { id: jobId },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });
  }

  const next = await prisma.provisioningJob.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (!next) return null;

  return prisma.provisioningJob.update({
    where: { id: next.id },
    data: {
      status: "processing",
      attempts: { increment: 1 },
      startedAt: new Date(),
    },
  });
}

export async function completeProvisioningJob(
  jobId: string,
  result: Record<string, unknown>,
  propFirmAccountId: string,
): Promise<void> {
  await prisma.provisioningJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      propFirmAccountId,
      result: result as object,
      completedAt: new Date(),
      error: null,
    },
  });
}

export async function failProvisioningJob(jobId: string, error: string): Promise<void> {
  const job = await prisma.provisioningJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const terminal = job.attempts >= job.maxAttempts;
  await prisma.provisioningJob.update({
    where: { id: jobId },
    data: {
      status: terminal ? "failed" : "pending",
      error,
      completedAt: terminal ? new Date() : null,
    },
  });

  if (!terminal) {
    scheduleProvisioningWorker(jobId);
  }
}
