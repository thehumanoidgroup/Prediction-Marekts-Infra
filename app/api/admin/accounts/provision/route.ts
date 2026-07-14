import { NextRequest, NextResponse } from "next/server";
import { getRequestTenant } from "@/lib/tenant-server";
import { ensureSeeded } from "@/lib/seed";
import { provisioningDbUnavailable } from "@/lib/provisioning/route-auth";
import { provisioningErrorResponse } from "@/lib/provisioning/errors";
import {
  fromApiModelTypeLoose,
  numericAccountSizeToApi,
  toKalshiProvisionResponse,
} from "@/lib/provisioning/kalshi-admin";
import {
  provisionNewAccount,
} from "@/services/account-provisioning";

/** Prop Firm Admin: manually provision a Kalshi-linked evaluation account (Prisma). */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

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

  try {
    const result = await provisionNewAccount({
      propFirmId: tenant.id,
      traderEmail: email,
      modelType,
      accountSize,
      customRules: {
        provider: typeof payload.provider === "string" ? payload.provider : "kalshi",
        ...customRules,
      },
      sendEmails: payload.send_credentials_email !== false,
      source: "manual",
      activateImmediately: true,
    });

    return NextResponse.json(
      toKalshiProvisionResponse(result, {
        displayName: typeof payload.display_name === "string" ? payload.display_name : undefined,
        provider: typeof payload.provider === "string" ? payload.provider : "kalshi",
      }),
      { status: 201 },
    );
  } catch (error) {
    return provisioningErrorResponse(error);
  }
}
