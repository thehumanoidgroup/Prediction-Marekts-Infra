import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { ensureSeeded } from "@/lib/seed";
import {
  authenticateWebhook,
  isAuthError,
  provisioningDbUnavailable,
} from "@/lib/provisioning/route-auth";
import { executeProvisioningRequest } from "@/lib/provisioning/execute";
import { provisioningWebhookSchema } from "@/lib/schemas/provisioning";
import {
  buildWebhookRateLimitKey,
  checkRateLimit,
  getWebhookRateLimitConfig,
} from "@/lib/provisioning/rate-limit";
import {
  getRequestIp,
  provisioningErrorResponse,
  provisioningValidationResponse,
} from "@/lib/provisioning/errors";
import { extractApiKeyFromRequest } from "@/lib/provisioning/api-keys";

/**
 * POST /api/provisioning/webhook
 *
 * Called by prop firms when a trader purchases an evaluation account.
 * Secured with per-firm API key (`X-API-Key` or `Authorization: Bearer ppk_...`).
 *
 * Body (snake_case):
 * {
 *   prop_firm_id, trader_email, model_type, account_size,
 *   provider?: "internal"|"polymarket"|"kalshi"|"sp500_dynamic",
 *   sp500_tickers?: string[],
 *   custom_rules?, async?
 * }
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  await ensureSeeded();

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
    parsed = provisioningWebhookSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) return provisioningValidationResponse(error);
    return provisioningErrorResponse(error, 400);
  }

  const presentedKey = extractApiKeyFromRequest(request);
  const rateKey = buildWebhookRateLimitKey({
    propFirmId: parsed.propFirmId,
    ipAddress,
    apiKeyPrefix: presentedKey?.slice(0, 12),
  });
  const rate = checkRateLimit(rateKey, getWebhookRateLimitConfig());
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: "RATE_LIMIT_EXCEEDED",
        error: "Too many provisioning requests",
        userMessage:
          "Rate limit exceeded. Wait a moment before sending another provisioning request.",
        retryAfterMs: rate.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rate.retryAfterMs ?? 60_000) / 1000)),
          "X-RateLimit-Limit": String(rate.limit),
          "X-RateLimit-Remaining": String(rate.remaining),
        },
      },
    );
  }

  const auth = await authenticateWebhook(request, parsed.propFirmId);
  if (isAuthError(auth)) return auth;

  try {
    const provider = parsed.provider ?? "kalshi";
    const sp500Tickers =
      provider === "sp500_dynamic"
        ? parsed.sp500Tickers?.map((t) => t.toUpperCase())
        : undefined;

    const response = await executeProvisioningRequest(
      {
        ...parsed,
        provider,
        sp500Tickers,
        challengeConfigOverrides: {
          otherCustomRules: {
            provider,
            ...(sp500Tickers?.length ? { sp500Tickers } : {}),
          },
        },
        loginMode: "password",
        auditContext: {
          apiKeyId: auth.keyId,
          ipAddress,
        },
      },
      "webhook",
    );
    return response;
  } catch (error) {
    return provisioningErrorResponse(error);
  }
}
