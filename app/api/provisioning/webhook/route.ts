import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import {
  authenticateWebhook,
  isAuthError,
  provisioningDbUnavailable,
} from "@/lib/provisioning/route-auth";
import { provisioningWebhookSchema } from "@/lib/schemas/provisioning";
import { provisionNewAccount } from "@/services/account-provisioning";

/**
 * POST /api/provisioning/webhook
 *
 * Called by prop firms when a trader purchases an evaluation account.
 * Secured with per-firm API key (`X-API-Key` or `Authorization: Bearer ppk_...`).
 *
 * Body (snake_case):
 * { prop_firm_id, trader_email, model_type, account_size, custom_rules? }
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  await ensureSeeded();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = provisioningWebhookSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const auth = await authenticateWebhook(request, parsed.propFirmId);
  if (isAuthError(auth)) return auth;

  try {
    const result = await provisionNewAccount({
      ...parsed,
      loginMode: "password",
    });

    return NextResponse.json(
      {
        account: result.account,
        credentialsFingerprint: result.credentialsFingerprint,
        // Prop firm forwards credentials to the trader via their own email system.
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
