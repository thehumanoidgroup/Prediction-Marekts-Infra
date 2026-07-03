import { NextResponse } from "next/server";
import {
  enqueueProvisioningJob,
  shouldUseAsyncQueue,
} from "@/lib/provisioning/queue";
import { logProvisioningAudit } from "@/lib/provisioning/audit";
import type { ProvisionNewAccountInput } from "@/services/account-provisioning";
import { provisionNewAccount } from "@/services/account-provisioning";

export interface ProvisioningRouteInput extends ProvisionNewAccountInput {
  async?: boolean;
  provisionedBy?: string;
}

export async function executeProvisioningRequest(
  input: ProvisioningRouteInput,
  source: "webhook" | "manual",
): Promise<NextResponse> {
  const useAsync = shouldUseAsyncQueue(input.async);

  if (useAsync) {
    const job = await enqueueProvisioningJob({
      source,
      payload: {
        ...input,
        source,
        provisionedBy: input.provisionedBy,
        auditContext: input.auditContext,
      },
    });

    await logProvisioningAudit({
      propFirmId: input.propFirmId,
      traderEmail: input.traderEmail,
      modelType: input.modelType,
      accountSize: input.accountSize,
      source,
      status: "queued",
      apiKeyId: input.auditContext?.apiKeyId,
      actorUserId: input.auditContext?.actorUserId ?? input.provisionedBy,
      ipAddress: input.auditContext?.ipAddress ?? null,
      metadata: { jobId: job.id },
    });

    return NextResponse.json(
      {
        job,
        status: "pending",
        message: "Provisioning queued for background processing",
        userMessage:
          "Your request was accepted and is being processed. Poll the job endpoint for status.",
      },
      { status: 202 },
    );
  }

  const result = await provisionNewAccount({
    ...input,
    source,
    provisionedBy: input.provisionedBy,
  });

  return NextResponse.json(
    {
      account: result.account,
      riskProfile: result.riskProfile,
      credentialsFingerprint: result.credentialsFingerprint,
      emails: result.emails,
      userMessage: `Account provisioned successfully for ${result.account.traderEmail}.`,
      ...(result.emails?.trader.sent ? {} : { credentials: result.credentials }),
    },
    { status: 201 },
  );
}
