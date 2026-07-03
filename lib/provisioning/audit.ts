/**
 * Immutable audit logging for provisioning attempts.
 */

import { prisma } from "@/lib/db";
import { fromApiAccountSize, fromApiModelType } from "@/lib/provisioning/serialize";
import type { AccountSize, PropFirmModelType } from "@/types/provisioning";

export type ProvisioningAuditStatus = "success" | "failed" | "queued";

export interface ProvisioningAuditInput {
  propFirmId: string;
  traderEmail: string;
  modelType: PropFirmModelType;
  accountSize: AccountSize;
  source: "webhook" | "manual" | "job";
  status: ProvisioningAuditStatus;
  propFirmAccountId?: string;
  credentialsFingerprint?: string;
  apiKeyId?: string;
  actorUserId?: string;
  ipAddress?: string | null;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export async function logProvisioningAudit(input: ProvisioningAuditInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    await prisma.provisioningAuditLog.create({
      data: {
        propFirmId: input.propFirmId,
        traderEmail: input.traderEmail.toLowerCase(),
        modelType: fromApiModelType(input.modelType),
        accountSize: fromApiAccountSize(input.accountSize),
        source: input.source,
        status: input.status,
        propFirmAccountId: input.propFirmAccountId ?? null,
        credentialsFingerprint: input.credentialsFingerprint ?? null,
        apiKeyId: input.apiKeyId ?? null,
        actorUserId: input.actorUserId ?? null,
        ipAddress: input.ipAddress ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });
  } catch (error) {
    console.error("[audit] Failed to write provisioning audit log:", error);
  }
}
