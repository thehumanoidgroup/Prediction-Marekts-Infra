import { NextRequest, NextResponse } from "next/server";
import { getRequestTenant } from "@/lib/tenant-server";
import { ensureSeeded } from "@/lib/seed";
import { provisioningDbUnavailable } from "@/lib/provisioning/route-auth";
import {
  challengeConfigToRules,
  fromApiModelTypeLoose,
  numericAccountSizeToApi,
} from "@/lib/provisioning/kalshi-admin";
import { getOrCreateFirmSettings } from "@/lib/provisioning/firm-settings";
import { resolveChallengeConfigForAccount } from "@/services/account-provisioning";

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const tenant = await getRequestTenant();
  await ensureSeeded();

  const modelType = fromApiModelTypeLoose(
    typeof payload.model_type === "string" ? payload.model_type : "1step",
  );
  const accountSize = numericAccountSizeToApi(
    typeof payload.account_size === "number" ? payload.account_size : 25_000,
  );
  const customRules =
    payload.challenge_rules && typeof payload.challenge_rules === "object"
      ? (payload.challenge_rules as Record<string, unknown>)
      : undefined;

  const firmSettings = await getOrCreateFirmSettings(tenant.id);
  const config = resolveChallengeConfigForAccount({
    propFirmId: tenant.id,
    modelType,
    accountSize,
    customRules: {
      provider: typeof payload.provider === "string" ? payload.provider : "kalshi",
      ...customRules,
    },
    firmProgram: tenant.program,
    firmSettings,
  });

  return NextResponse.json(
    challengeConfigToRules(config, {
      provider: typeof payload.provider === "string" ? payload.provider : "kalshi",
      modelType,
      accountSize,
    }),
  );
}
