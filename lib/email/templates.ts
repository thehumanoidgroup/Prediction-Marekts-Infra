import type {
  ChallengeConfigInput,
  PropFirmAccountRecord,
  TraderLoginCredentials,
} from "@/types/provisioning";

export interface EmailTemplateContext {
  firmName: string;
  supportContact: string;
  appUrl: string;
  virtualBalance: number;
  challengeConfig: ChallengeConfigInput;
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
  /** Prop firm operator inbox (admin or billing contact). */
  recipientEmail: string;
}

const MODEL_LABELS: Record<PropFirmAccountRecord["modelType"], string> = {
  "1step": "1-Step Evaluation",
  "2step": "2-Step Evaluation",
  "3step": "3-Step Evaluation",
  instant: "Instant Funding",
};

export function formatModelType(modelType: PropFirmAccountRecord["modelType"]): string {
  return MODEL_LABELS[modelType];
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
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
  if (typeof rules.minTradingDays === "number") {
    lines.push(`Minimum trading days: ${rules.minTradingDays}`);
  }
  if (typeof rules.challengeDurationDays === "number") {
    lines.push(`Challenge duration: ${rules.challengeDurationDays} days`);
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
  return rules.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
}

/** Trader-facing "account created" email (HTML + plain text). */
export function renderTraderCredentialsEmail(data: TraderCredentialsEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { account, credentials, context } = data;
  const rules = buildChallengeRulesSummary(context.challengeConfig);
  const loginUrl = credentials.magicLink ?? credentials.loginUrl ?? context.appUrl;
  const subject = `Your ${context.firmName} evaluation account is ready`;

  const credentialBlock = credentials.magicLink
    ? `<p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;background:#22c55e;color:#04170b;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Log in to your account</a></p>
       <p style="color:#6b7280;font-size:13px;">Or copy this link: ${escapeHtml(loginUrl)}</p>`
    : `<table style="margin:16px 0;border-collapse:collapse;">
         <tr><td style="padding:6px 12px;color:#6b7280;">Username</td><td style="padding:6px 12px;font-family:monospace;">${escapeHtml(credentials.username)}</td></tr>
         <tr><td style="padding:6px 12px;color:#6b7280;">Password</td><td style="padding:6px 12px;font-family:monospace;">${escapeHtml(credentials.password)}</td></tr>
       </table>
       <p><a href="${escapeHtml(loginUrl)}" style="color:#22c55e;">${escapeHtml(loginUrl)}</a></p>`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#0b0f14;color:#e5e7eb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px;">
    <p style="color:#22c55e;font-weight:600;margin:0 0 8px;">${escapeHtml(context.firmName)}</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#f9fafb;">Your evaluation account is ready</h1>
    <p>Hi,</p>
    <p>Your prediction market evaluation account has been provisioned. Here are your details:</p>
    <ul style="padding-left:20px;line-height:1.7;">
      <li><strong>Program:</strong> ${escapeHtml(formatModelType(account.modelType))}</li>
      <li><strong>Account size:</strong> ${escapeHtml(account.accountSize)} (${formatCurrency(context.virtualBalance)})</li>
      <li><strong>Account ID:</strong> ${escapeHtml(account.id)}</li>
    </ul>
    <h2 style="font-size:16px;margin:24px 0 8px;">Challenge rules</h2>
    <ul style="padding-left:20px;line-height:1.7;">${rulesHtml(rules)}</ul>
    <h2 style="font-size:16px;margin:24px 0 8px;">Login</h2>
    ${credentialBlock}
    <p style="margin-top:28px;font-size:13px;color:#9ca3af;">Questions? Contact us at <a href="mailto:${escapeHtml(context.supportContact)}" style="color:#22c55e;">${escapeHtml(context.supportContact)}</a></p>
  </div>
</body></html>`;

  const textRules = rules.map((line) => `  - ${line}`).join("\n");
  const textCreds = credentials.magicLink
    ? `Login link: ${loginUrl}`
    : `Username: ${credentials.username}\nPassword: ${credentials.password}\nLogin: ${loginUrl}`;

  const text = `${context.firmName} — Your evaluation account is ready

Program: ${formatModelType(account.modelType)}
Account size: ${account.accountSize} (${formatCurrency(context.virtualBalance)})
Account ID: ${account.id}

Challenge rules:
${textRules}

Login:
${textCreds}

Support: ${context.supportContact}`;

  return { subject, html, text };
}

/** Prop firm operator notification (HTML + plain text). */
export function renderPropFirmNotificationEmail(data: PropFirmNotificationEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { account, credentials, context } = data;
  const rules = buildChallengeRulesSummary(context.challengeConfig);
  const subject = `Account provisioned: ${account.traderEmail} (${account.accountSize} ${formatModelType(account.modelType)})`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;background:#f3f4f6;color:#111827;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
    <h1 style="margin:0 0 8px;font-size:20px;">New account provisioned</h1>
    <p style="color:#6b7280;margin:0 0 20px;">${escapeHtml(context.firmName)} · automated provisioning</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;">Trader</td><td style="padding:8px 0;"><strong>${escapeHtml(account.traderEmail)}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Program</td><td style="padding:8px 0;">${escapeHtml(formatModelType(account.modelType))}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Account size</td><td style="padding:8px 0;">${escapeHtml(account.accountSize)} (${formatCurrency(context.virtualBalance)})</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td style="padding:8px 0;">${escapeHtml(account.status)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Account ID</td><td style="padding:8px 0;font-family:monospace;font-size:12px;">${escapeHtml(account.id)}</td></tr>
    </table>
    <h2 style="font-size:15px;margin:24px 0 8px;">Challenge rules applied</h2>
    <ul style="padding-left:20px;line-height:1.7;font-size:14px;">${rulesHtml(rules)}</ul>
    <p style="font-size:13px;color:#6b7280;">Trader credentials were emailed to the purchaser. Credential fingerprint: <code>${escapeHtml(credentials.username)}</code></p>
    <p style="margin-top:24px;font-size:13px;color:#6b7280;">Platform support: <a href="mailto:${escapeHtml(context.supportContact)}">${escapeHtml(context.supportContact)}</a></p>
  </div>
</body></html>`;

  const text = `New account provisioned — ${context.firmName}

Trader: ${account.traderEmail}
Program: ${formatModelType(account.modelType)}
Account size: ${account.accountSize} (${formatCurrency(context.virtualBalance)})
Status: ${account.status}
Account ID: ${account.id}

Challenge rules:
${rules.map((line) => `  - ${line}`).join("\n")}

Trader credentials were sent to the purchaser.

Support: ${context.supportContact}`;

  return { subject, html, text };
}
