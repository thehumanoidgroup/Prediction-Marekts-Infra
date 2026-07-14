/**
 * Processes queued provisioning jobs (database-backed async worker).
 */

import {
  claimNextProvisioningJob,
  completeProvisioningJob,
  failProvisioningJob,
} from "@/lib/provisioning/queue";
import { logAccountProvisioningFailed } from "@/lib/platform/activity";
import { provisionNewAccount, type ProvisionNewAccountInput } from "@/services/account-provisioning";
import { prisma } from "@/lib/db";
import { tenantRowToConfig } from "@/lib/tenant-db";

interface JobPayload extends ProvisionNewAccountInput {
  source?: "webhook" | "manual";
  provisionedBy?: string;
}

export async function processProvisioningJob(jobId?: string): Promise<{
  processed: boolean;
  jobId?: string;
  accountId?: string;
  error?: string;
}> {
  const job = await claimNextProvisioningJob(jobId);
  if (!job) {
    return { processed: false };
  }

  const payload = job.payload as unknown as JobPayload;
  const source = payload.source ?? job.source;

  try {
    const result = await provisionNewAccount({
      ...payload,
      source,
      provisionedBy: payload.provisionedBy,
    });

    await completeProvisioningJob(
      job.id,
      {
        accountId: result.account.id,
        status: result.account.status,
        credentialsFingerprint: result.credentialsFingerprint,
        emails: result.emails,
      },
      result.account.id,
    );

    return { processed: true, jobId: job.id, accountId: result.account.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning failed";

    let tenantName: string | undefined;
    try {
      const firm = await prisma.tenant.findUnique({ where: { id: payload.propFirmId } });
      tenantName = firm ? tenantRowToConfig(firm).name : undefined;
    } catch {
      // ignore lookup errors during failure logging
    }

    await failProvisioningJob(job.id, message);

    if (job.attempts >= job.maxAttempts) {
      await logAccountProvisioningFailed({
        tenantId: payload.propFirmId,
        tenantName,
        traderEmail: payload.traderEmail,
        error: message,
        jobId: job.id,
        source: source === "manual" ? "manual" : source === "webhook" ? "webhook" : "job",
      });
    }

    return { processed: true, jobId: job.id, error: message };
  }
}
