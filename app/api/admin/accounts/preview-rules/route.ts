import { NextRequest, NextResponse } from "next/server";
import { getRequestTenant } from "@/lib/tenant-server";
import { ensureSeeded } from "@/lib/seed";
import {
  challengeConfigToRules,
  fromApiModelTypeLoose,
  numericAccountSizeToApi,
} from "@/lib/provisioning/kalshi-admin";
import { getOrCreateFirmSettings } from "@/lib/provisioning/firm-settings";
import {
  normalizeChallengeRulesInput,
  normalizeProvider,
} from "@/lib/provisioning/challenge-rules";
import { getSp500ChallengeTemplate } from "@/lib/sp500/challenge-templates";
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

  const provider = normalizeProvider(payload.provider, "kalshi");
  const modelType = fromApiModelTypeLoose(
    typeof payload.model_type === "string" ? payload.model_type : "1step",
  );
  const accountSize = numericAccountSizeToApi(
    typeof payload.account_size === "number" ? payload.account_size : 25_000,
  );

  const templateId =
    typeof payload.template_config_id === "string" ? payload.template_config_id : "";
  const template =
    provider === "sp500_dynamic" && templateId ? getSp500ChallengeTemplate(templateId) : null;

  const customRules = normalizeChallengeRulesInput({
    ...(template
      ? {
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
        }
      : {}),
    ...(payload.challenge_rules && typeof payload.challenge_rules === "object"
      ? (payload.challenge_rules as Record<string, unknown>)
      : {}),
  });

  const firmSettings = await getOrCreateFirmSettings(tenant.id);
  const config = resolveChallengeConfigForAccount({
    propFirmId: tenant.id,
    modelType,
    accountSize,
    customRules,
    challengeConfigOverrides: {
      otherCustomRules: { provider },
    },
    firmProgram: tenant.program,
    firmSettings,
  });

  return NextResponse.json(
    challengeConfigToRules(config, {
      provider,
      modelType,
      accountSize,
    }),
  );
}
