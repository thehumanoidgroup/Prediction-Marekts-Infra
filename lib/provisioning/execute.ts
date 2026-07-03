import { NextRequest, NextResponse } from "next/server";
import {
  enqueueProvisioningJob,
  shouldUseAsyncQueue,
} from "@/lib/provisioning/queue";
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
      },
    });

    return NextResponse.json(
      {
        job,
        status: "pending",
        message: "Provisioning queued for background processing",
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
      ...(result.emails?.trader.sent ? {} : { credentials: result.credentials }),
    },
    { status: 201 },
  );
}
