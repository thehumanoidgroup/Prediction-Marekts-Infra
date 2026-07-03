import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import {
  isAuthError,
  provisioningDbUnavailable,
  requireSuperAdmin,
} from "@/lib/provisioning/route-auth";
import { provisioningManualSchema } from "@/lib/schemas/provisioning";
import { provisionNewAccount } from "@/services/account-provisioning";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = provisioningManualSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await provisionNewAccount(parsed);

    return NextResponse.json(
      {
        account: result.account,
        riskProfile: result.riskProfile,
        credentialsFingerprint: result.credentialsFingerprint,
        emails: result.emails,
        ...(result.emails?.trader.sent ? {} : { credentials: result.credentials }),
        provisionedBy: admin.userId,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning failed";
    const status = message.includes("not found") ? 404 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
