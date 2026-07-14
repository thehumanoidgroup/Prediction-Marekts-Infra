import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { listPropFirmAccounts } from "@/lib/provisioning/accounts";
import {
  isAuthError,
  provisioningDbUnavailable,
  requireSuperAdmin,
} from "@/lib/provisioning/route-auth";
import { listProvisioningAccountsQuerySchema } from "@/lib/schemas/provisioning";
import { provisioningValidationResponse } from "@/lib/provisioning/errors";
import { ensureSeeded } from "@/lib/seed";
import type { PropFirmAccountRecord } from "@/types/provisioning";

/**
 * GET /api/provisioning/accounts
 *
 * List sold prop firm accounts. Super Admin only.
 * Query: prop_firm_id, status, trader_email, model_type, account_size, page, pageSize
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  await ensureSeeded();

  const admin = await requireSuperAdmin(request);
  if (isAuthError(admin)) return admin;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  let query;
  try {
    query = listProvisioningAccountsQuerySchema.parse(params);
  } catch (error) {
    if (error instanceof ZodError) return provisioningValidationResponse(error);
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        error: "Invalid query parameters",
        userMessage: "One or more filter parameters are invalid.",
      },
      { status: 400 },
    );
  }

  const result = await listPropFirmAccounts({
    propFirmId: query.prop_firm_id ?? query.propFirmId,
    status: query.status as PropFirmAccountRecord["status"] | undefined,
    traderEmail: query.trader_email ?? query.traderEmail,
    modelType: (query.model_type ?? query.modelType) as
      | PropFirmAccountRecord["modelType"]
      | undefined,
    accountSize: (query.account_size ?? query.accountSize) as
      | PropFirmAccountRecord["accountSize"]
      | undefined,
    page: query.page,
    pageSize: query.pageSize,
  });

  return NextResponse.json(result);
}
