import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { ensureSeeded } from "@/lib/seed";
import {
  isAuthError,
  provisioningDbUnavailable,
  requireSuperAdmin,
} from "@/lib/provisioning/route-auth";
import { executeProvisioningRequest } from "@/lib/provisioning/execute";
import { provisioningManualSchema } from "@/lib/schemas/provisioning";
import {
  getRequestIp,
  provisioningErrorResponse,
  provisioningValidationResponse,
} from "@/lib/provisioning/errors";

/**
 * POST /api/provisioning/manual
 *
 * Super Admin endpoint to manually provision a sold account.
 * Requires `Authorization: Bearer <super_admin_jwt>`.
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  await ensureSeeded();

  const admin = await requireSuperAdmin(request);
  if (isAuthError(admin)) return admin;

  const ipAddress = getRequestIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: "INVALID_JSON",
        error: "Invalid JSON body",
        userMessage: "The request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = provisioningManualSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) return provisioningValidationResponse(error);
    return provisioningErrorResponse(error, 400);
  }

  try {
    const response = await executeProvisioningRequest(
      {
        ...parsed,
        provisionedBy: admin.userId,
        auditContext: {
          actorUserId: admin.userId,
          ipAddress,
        },
      },
      "manual",
    );

    const payload = await response.json();
    return NextResponse.json(
      {
        ...payload,
        provisionedBy: admin.userId,
      },
      { status: response.status },
    );
  } catch (error) {
    return provisioningErrorResponse(error);
  }
}
