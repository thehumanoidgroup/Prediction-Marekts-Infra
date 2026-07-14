import { NextRequest, NextResponse } from "next/server";
import { getPropFirmAccount } from "@/lib/provisioning/accounts";
import {
  isAuthError,
  provisioningDbUnavailable,
  requireSuperAdmin,
} from "@/lib/provisioning/route-auth";
import { ensureSeeded } from "@/lib/seed";

/**
 * GET /api/provisioning/accounts/{id}
 *
 * Fetch a single sold account with challenge config and demo account metadata.
 * Super Admin only. Login credentials are never returned.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  await ensureSeeded();

  const admin = await requireSuperAdmin(request);
  if (isAuthError(admin)) return admin;

  const { id } = await context.params;
  const account = await getPropFirmAccount(id);

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({ account });
}
