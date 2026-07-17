import type {
  ChallengeConfigInput,
  PropFirmAccountRecord,
  TraderLoginCredentials,
} from "@/types/provisioning";

export type MarketProviderLabel =
  | "internal"
  | "polymarket"
  | "kalshi"
  | "sp500_dynamic"
  | string;

export interface EmailTemplateContext {
  firmName: string;
  supportContact: string;
  appUrl: string;
  /** Deep link into the trader dashboard (tenant-aware). */
  dashboardUrl: string;
  virtualBalance: number;
  challengeConfig: ChallengeConfigInput;
  /** Market provider for this evaluation account. */
  provider?: MarketProviderLabel;
  tenantSlug?: string;
  /** Display name of the admin who issued the account (firm copy). */
  issuedByName?: string;
}

export interface TraderCredentialsEmailData {
  account: PropFirmAccountRecord;
  credentials: TraderLoginCredentials & { magicLink?: string };
  context: EmailTemplateContext;
}

export interface PropFirmNotificationEmailData {
  account: PropFirmAccountRecord;
  credentials: TraderLoginCredentials & { magicLink?: string };
  context: EmailTemplateContext;
  /** Prop firm operator inbox (issuing admin or firm contact). */
  recipientEmail: string;
}

const MODEL_LABELS: Record<PropFirmAccountRecord["modelType"], string> = {
  "1step": "1-Step Evaluation",
  "2step": "2-Step Evaluation",
  "3step": "3-Step Evaluation",
  instant: "Instant Funding",
};

const PROVIDER_LABELS: Record<string, string> = {
  internal: "Internal LMSR",
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  sp500_dynamic: "S&P 500 Dynamic Markets",
};

export function formatModelType(modelType: PropFirmAccountRecord["modelType"]): string {
  return MODEL_LABELS[modelType];
}

export function formatProvider(provider?: string | null): string {
  if (!provider) return "Internal LMSR";
  return PROVIDER_LABELS[provider] ?? provider;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function resolveProviderFromAccount(
  account: PropFirmAccountRecord,
  fallback?: string,
): string {
  const fromConfig = account.challengeConfig?.otherCustomRules?.provider;
  if (typeof fromConfig === "string" && fromConfig.trim()) return fromConfig.trim();
  if (fallback) return fallback;
  return "internal";
}

export function buildChallengeRulesSummary(config: ChallengeConfigInput): string[] {
  const maxBet =
    config.maxBetSizeMode === "fixed"
      ? `Max bet per pick: ${formatCurrency(config.maxBetSizeValue)}`
      : `Max bet per pick: ${config.maxBetSizeValue}% of balance`;

  const lines = [
    `Profit target: ${config.profitTarget}%`,
    `Daily drawdown limit: ${config.dailyDrawdown}%`,
    `Max drawdown: ${config.maxDrawdown}%`,
    maxBet,
  ];

  if (config.consistencyScore != null) {
    lines.push(`Consistency score target: ${config.consistencyScore}%`);
  }

  const rules = config.otherCustomRules ?? {};
  if (typeof rules.drawdownMode === "string") {
    lines.push(`Drawdown mode: ${rules.drawdownMode}`);
  } else if (typeof rules.drawdown_mode === "string") {
    lines.push(`Drawdown mode: ${rules.drawdown_mode}`);
  }
  if (typeof rules.minTradingDays === "number") {
    lines.push(`Minimum trading days: ${rules.minTradingDays}`);
  }
  if (typeof rules.challengeDurationDays === "number") {
    lines.push(`Challenge duration: ${rules.challengeDurationDays} days`);
  }
  if (typeof rules.profitSplitPct === "number") {
    lines.push(`Profit split: ${rules.profitSplitPct}%`);
  } else if (typeof rules.profit_split_pct === "number") {
    lines.push(`Profit split: ${rules.profit_split_pct}%`);
  }

  return lines;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rulesHtml(rules: string[]): string {
  return rules.map((line) => `<li style="margin:0 0 6px;">${escapeHtml(line)}</li>`).join("");
}

function buildDashboardUrl(context: EmailTemplateContext): string {
  if (context.dashboardUrl) return context.dashboardUrl;
  const base = context.appUrl.replace(/\/$/, "");
  const tenant = context.tenantSlug;
  return tenant ? `${base}/dashboard?tenant=${encodeURIComponent(tenant)}` : `${base}/dashboard`;
}

function buildLoginUrl(
  credentials: TraderLoginCredentials & { magicLink?: string },
  context: EmailTemplateContext,
): string {
  if (credentials.magicLink) return credentials.magicLink;
  if (credentials.loginUrl) return credentials.loginUrl;
  const base = context.appUrl.replace(/\/$/, "");
  const tenant = context.tenantSlug;
  return tenant ? `${base}/login?tenant=${encodeURIComponent(tenant)}` : `${base}/login`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;width:38%;font-size:14px;">${escapeHtml(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;">${value}</td>
  </tr>`;
}

function ctaButton(href: string, label: string): string {
  return `<p style="margin:24px 0 8px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>
  </p>`;
}

/** Trader-facing "account ready" email (HTML + plain text). */
export function renderTraderCredentialsEmail(data: TraderCredentialsEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { account, credentials, context } = data;
  const rules = buildChallengeRulesSummary(context.challengeConfig);
  const provider = formatProvider(
    context.provider ?? resolveProviderFromAccount(account),
  );
  const loginUrl = buildLoginUrl(credentials, context);
  const dashboardUrl = buildDashboardUrl(context);
  const modelLabel = formatModelType(account.modelType);
  const subject = `Your ${context.firmName} Prediction Markets Account is Ready`;

  const credentialRows = credentials.magicLink
    ? detailRow("Login", `<a href="${escapeHtml(loginUrl)}" style="color:#0f766e;">Sign in with magic link</a>`)
    : `${detailRow("Username", `<span style="font-family:ui-monospace,monospace;">${escapeHtml(credentials.username)}</span>`)}
       ${detailRow("Password", `<span style="font-family:ui-monospace,monospace;">${escapeHtml(credentials.password)}</span>`)}
       ${detailRow("Login link", `<a href="${escapeHtml(loginUrl)}" style="color:#0f766e;word-break:break-all;">${escapeHtml(loginUrl)}</a>`)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 12px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#0f766e;font-weight:700;">${escapeHtml(context.firmName)}</p>
            <h1 style="margin:0;font-size:22px;line-height:1.3;color:#111827;font-weight:700;">Your Prediction Markets Account is Ready</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
              Your prediction markets evaluation account has been issued. Use the details below to sign in and start trading.
            </p>

            <h2 style="margin:24px 0 8px;font-size:15px;color:#111827;">Account details</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${detailRow("Model type", escapeHtml(modelLabel))}
              ${detailRow("Account size", `${escapeHtml(account.accountSize)} (${formatCurrency(context.virtualBalance)})`)}
              ${detailRow("Provider", escapeHtml(provider))}
            </table>

            <h2 style="margin:28px 0 8px;font-size:15px;color:#111827;">Challenge rules</h2>
            <ul style="margin:0;padding:0 0 0 18px;color:#374151;font-size:14px;line-height:1.6;">
              ${rulesHtml(rules)}
            </ul>

            <h2 style="margin:28px 0 8px;font-size:15px;color:#111827;">Login credentials</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${credentialRows}
            </table>
            ${ctaButton(loginUrl, credentials.magicLink ? "Sign in with magic link" : "Open login page")}

            <h2 style="margin:28px 0 8px;font-size:15px;color:#111827;">Trader Dashboard</h2>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
              After signing in, open your dashboard to view markets, positions, and challenge progress.
            </p>
            ${ctaButton(dashboardUrl, "Open Trader Dashboard")}
            <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;">${escapeHtml(dashboardUrl)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
              Need help? Contact support at
              <a href="mailto:${escapeHtml(context.supportContact)}" style="color:#0f766e;text-decoration:none;">${escapeHtml(context.supportContact)}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textRules = rules.map((line) => `  - ${line}`).join("\n");
  const textCreds = credentials.magicLink
    ? `Magic link: ${loginUrl}`
    : `Username: ${credentials.username}\nPassword: ${credentials.password}\nLogin link: ${loginUrl}`;

  const text = `Your ${context.firmName} Prediction Markets Account is Ready

Your prediction markets evaluation account has been issued. Use the details below to sign in and start trading.

Account details
  Model type: ${modelLabel}
  Account size: ${account.accountSize} (${formatCurrency(context.virtualBalance)})
  Provider: ${provider}

Challenge rules
${textRules}

Login credentials
${textCreds}

Trader Dashboard
${dashboardUrl}

Support contact: ${context.supportContact}`;

  return { subject, html, text };
}

/** Optional copy for the prop firm admin who issued (or manages) the account. */
export function renderPropFirmNotificationEmail(data: PropFirmNotificationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { account, credentials, context } = data;
  const rules = buildChallengeRulesSummary(context.challengeConfig);
  const provider = formatProvider(
    context.provider ?? resolveProviderFromAccount(account),
  );
  const dashboardUrl = buildDashboardUrl(context);
  const modelLabel = formatModelType(account.modelType);
  const subject = `Account issued: ${account.traderEmail} · ${account.accountSize} ${modelLabel}`;

  const issuedByLine = context.issuedByName
    ? detailRow("Issued by", escapeHtml(context.issuedByName))
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 12px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#0f766e;font-weight:700;">${escapeHtml(context.firmName)}</p>
            <h1 style="margin:0;font-size:20px;line-height:1.3;color:#111827;font-weight:700;">Account issuance confirmation</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
              A prediction markets evaluation account was issued. Login credentials were emailed to the trader.
            </p>

            <h2 style="margin:8px 0;font-size:15px;color:#111827;">Issuance summary</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${detailRow("Trader", escapeHtml(account.traderEmail))}
              ${detailRow("Model type", escapeHtml(modelLabel))}
              ${detailRow("Account size", `${escapeHtml(account.accountSize)} (${formatCurrency(context.virtualBalance)})`)}
              ${detailRow("Provider", escapeHtml(provider))}
              ${detailRow("Status", escapeHtml(account.status))}
              ${detailRow("Account ID", `<span style="font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(account.id)}</span>`)}
              ${issuedByLine}
            </table>

            <h2 style="margin:28px 0 8px;font-size:15px;color:#111827;">Challenge rules applied</h2>
            <ul style="margin:0;padding:0 0 0 18px;color:#374151;font-size:14px;line-height:1.6;">
              ${rulesHtml(rules)}
            </ul>

            <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">
              Credential username on file: <code style="font-size:12px;">${escapeHtml(credentials.username)}</code>
              (password / magic link sent only to the trader).
            </p>
            ${ctaButton(dashboardUrl, "View Trader Dashboard")}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:13px;color:#6b7280;">
              Platform support:
              <a href="mailto:${escapeHtml(context.supportContact)}" style="color:#0f766e;text-decoration:none;">${escapeHtml(context.supportContact)}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Account issuance confirmation — ${context.firmName}

A prediction markets evaluation account was issued. Login credentials were emailed to the trader.

Issuance summary
  Trader: ${account.traderEmail}
  Model type: ${modelLabel}
  Account size: ${account.accountSize} (${formatCurrency(context.virtualBalance)})
  Provider: ${provider}
  Status: ${account.status}
  Account ID: ${account.id}${context.issuedByName ? `\n  Issued by: ${context.issuedByName}` : ""}

Challenge rules applied
${rules.map((line) => `  - ${line}`).join("\n")}

Credential username on file: ${credentials.username}
(password / magic link sent only to the trader)

Trader Dashboard: ${dashboardUrl}

Support contact: ${context.supportContact}`;

  return { subject, html, text };
}
