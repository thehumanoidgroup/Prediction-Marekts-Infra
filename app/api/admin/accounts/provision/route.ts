import { NextRequest, NextResponse } from "next/server";
import { getRequestTenant } from "@/lib/tenant-server";
import { ensureSeeded } from "@/lib/seed";
import { decodeAccessToken, getBearerToken } from "@/lib/auth";
import { provisioningDbUnavailable } from "@/lib/provisioning/route-auth";
import { provisioningErrorResponse } from "@/lib/provisioning/errors";
import {
  fromApiModelTypeLoose,
  numericAccountSizeToApi,
  toKalshiProvisionResponse,
} from "@/lib/provisioning/kalshi-admin";
import {
  normalizeChallengeRulesInput,
  normalizeProvider,
  splitProviderMeta,
} from "@/lib/provisioning/challenge-rules";
import { getTemplateForModel } from "@/lib/provisioning/challenge-template-service";
import { firmTemplateToChallengeRulesInput } from "@/lib/provisioning/firm-template-rules";
import { defaultVirtualBalance } from "@/lib/provisioning/serialize";
import { DEFAULT_SP500_TICKERS, getSp500ChallengeTemplate } from "@/lib/sp500/challenge-templates";
import { provisionNewAccount } from "@/services/account-provisioning";

/** Soft-resolve the issuing admin from the Bearer JWT when present. */
async function resolveIssuingAdminId(request: NextRequest): Promise<string | undefined> {
  const token = getBearerToken(request);
  if (!token) return undefined;
  const payload = await decodeAccessToken(token);
  return payload?.sub;
}

/** Prop Firm Admin: manually provision an evaluation account (Prisma). */
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
  const issuedByUserId = await resolveIssuingAdminId(request);

  const provider = normalizeProvider(payload.provider, "kalshi");
  const modelType = fromApiModelTypeLoose(
    typeof payload.model_type === "string" ? payload.model_type : "1step",
  );
  const accountSize = numericAccountSizeToApi(
    typeof payload.account_size === "number" ? payload.account_size : 25_000,
  );
  const accountSizeUsd = defaultVirtualBalance(accountSize);

  const firmTemplate = await getTemplateForModel(tenant.id, modelType);
  const firmRules = normalizeChallengeRulesInput(
    firmTemplateToChallengeRulesInput(firmTemplate, accountSizeUsd) as Record<string, unknown>,
  );

  const rawRules =
    payload.challenge_rules && typeof payload.challenge_rules === "object"
      ? normalizeChallengeRulesInput(payload.challenge_rules as Record<string, unknown>)
      : {};

  // Apply built-in stock-event template defaults when selected.
  const templateId =
    typeof payload.template_config_id === "string" ? payload.template_config_id : "";
  const template =
    provider === "sp500_dynamic" && templateId ? getSp500ChallengeTemplate(templateId) : null;
  const templateRules = template
    ? normalizeChallengeRulesInput({
        profit_target_pct: template.rules.profit_target_pct,
        max_daily_loss_pct: template.rules.max_daily_loss_pct,
        max_drawdown_pct: template.rules.max_drawdown_pct,
        drawdown_mode: template.rules.drawdown_mode,
        max_stake_per_order: template.rules.max_stake_per_order,
        max_exposure_per_market: template.rules.max_exposure_per_market,
        min_consistency_score: template.rules.min_consistency_score,
        min_trading_days: template.rules.min_trading_days,
        challenge_duration_days: template.rules.challenge_duration_days,
        profit_split_pct: template.rules.profit_split_pct,
      })
    : {};

  const { customRules, providerMeta } = splitProviderMeta({
    ...firmRules,
    ...templateRules,
    ...rawRules,
    provider,
  });

  const sp500Tickers =
    provider === "sp500_dynamic"
      ? Array.isArray(providerMeta.sp500Tickers)
        ? (providerMeta.sp500Tickers as string[])
        : Array.isArray(payload.sp500_tickers)
          ? (payload.sp500_tickers as string[]).map((t) => String(t).toUpperCase())
          : [...DEFAULT_SP500_TICKERS]
      : undefined;

  try {
    const result = await provisionNewAccount({
      propFirmId: tenant.id,
      traderEmail: email,
      modelType,
      accountSize,
      provider,
      sp500Tickers,
      customRules,
      challengeConfigOverrides: {
        templateId: firmTemplate.isDefault ? null : firmTemplate.id,
        otherCustomRules: {
          provider,
          ...(sp500Tickers ? { sp500Tickers } : {}),
        },
      },
      sendEmails: payload.send_credentials_email !== false,
      source: "manual",
      activateImmediately: true,
      provisionedBy: issuedByUserId,
      auditContext: issuedByUserId ? { actorUserId: issuedByUserId } : undefined,
    });

    return NextResponse.json(
      toKalshiProvisionResponse(result, {
        displayName: typeof payload.display_name === "string" ? payload.display_name : undefined,
        provider,
        sp500Tickers,
      }),
      { status: 201 },
    );
  } catch (error) {
    return provisioningErrorResponse(error);
  }
}
