import { NextRequest, NextResponse } from "next/server";
import { listRiskProfiles } from "@/lib/engine/risk";
import { ensureSeeded } from "@/lib/seed";
import { provisionNewAccount } from "@/services/account-provisioning";

/**
 * Super Admin / webhook endpoint for automated account provisioning.
 *
 * POST /api/platform/provisioning
 * Body: { propFirmId, traderEmail, modelType, accountSize, customRules?, ... }
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureSeeded();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await provisionNewAccount(body as Parameters<typeof provisionNewAccount>[0]);

    return NextResponse.json(
      {
        account: result.account,
        riskProfile: result.riskProfile,
        credentialsFingerprint: result.credentialsFingerprint,
        // Credentials included for webhook consumers to forward to email —
        // strip before logging or storing audit trails.
        credentials: result.credentials,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provisioning failed";
    const status = message.includes("not found") ? 404 : 422;
    return NextResponse.json({ error: message }, { status });
  }
}

/** List in-process risk profiles (diagnostics). */
export async function GET(request: NextRequest) {
  const propFirmId = request.nextUrl.searchParams.get("propFirmId") ?? undefined;
  return NextResponse.json({ profiles: listRiskProfiles(propFirmId) });
}
