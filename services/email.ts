/**
 * Provisioning email service.
 *
 * Equivalent of the requested `backend/services/email_service.py`.
 * Uses Resend in production; logs to console when `RESEND_API_KEY` is unset.
 *
 * Called automatically after Prop Firm Admin "Issue Account" succeeds
 * (`sendEmails` defaults to true in `provisionNewAccount`).
 *
 * Sends:
 *  1. Trader welcome email (credentials, model, rules, login, support)
 *  2. Optional confirmation copy to the issuing prop firm admin
 */

import { deliverEmail } from "@/lib/email/send";
import {
  renderPropFirmNotificationEmail,
  renderTraderCredentialsEmail,
  resolveProviderFromAccount,
  type EmailTemplateContext,
} from "@/lib/email/templates";
import { prisma } from "@/lib/db";
import type {
  ChallengeConfigInput,
  PropFirmAccountRecord,
  TraderLoginCredentials,
} from "@/types/provisioning";

export interface ProvisioningEmailInput {
  account: PropFirmAccountRecord;
  credentials: TraderLoginCredentials & { magicLink?: string };
  firmName: string;
  propFirmId: string;
  virtualBalance: number;
  challengeConfig: ChallengeConfigInput;
  supportContact?: string;
  /** Override prop firm notification recipient (issuing admin email). */
  propFirmNotifyEmail?: string;
  /** Prefer this user as the optional firm confirmation recipient. */
  issuedByUserId?: string;
  /** Tenant slug for dashboard / login deep links. */
  tenantSlug?: string;
  /** Market provider for this evaluation (internal / kalshi / …). */
  provider?: string;
  /** When false, skip the optional prop firm admin copy. Default: true. */
  notifyPropFirm?: boolean;
}

export interface ProvisioningEmailResult {
  trader: { sent: boolean; messageId?: string };
  propFirm: { sent: boolean; messageId?: string; recipient?: string };
}

function appBaseUrl(tenantSlug?: string): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (tenantSlug) return `https://${tenantSlug}.proppredict.com`;
  return "http://localhost:3000";
}

function buildDashboardUrl(appUrl: string, tenantSlug?: string, propFirmId?: string): string {
  const tenant = tenantSlug || propFirmId;
  return tenant
    ? `${appUrl}/dashboard?tenant=${encodeURIComponent(tenant)}`
    : `${appUrl}/dashboard`;
}

function resolveSupportContact(input: ProvisioningEmailInput): string {
  return (
    input.supportContact ??
    process.env.SUPPORT_EMAIL ??
    process.env.SUPPORT_CONTACT ??
    "support@proppredict.com"
  );
}

function buildContext(
  input: ProvisioningEmailInput,
  supportContact: string,
  issuedByName?: string,
): EmailTemplateContext {
  const appUrl = appBaseUrl(input.tenantSlug);
  const provider =
    input.provider ??
    resolveProviderFromAccount(input.account) ??
    "internal";

  return {
    firmName: input.firmName,
    supportContact,
    appUrl,
    dashboardUrl: buildDashboardUrl(appUrl, input.tenantSlug, input.propFirmId),
    virtualBalance: input.virtualBalance,
    challengeConfig: input.challengeConfig,
    provider,
    tenantSlug: input.tenantSlug,
    issuedByName,
  };
}

/**
 * Resolve the optional prop firm confirmation recipient.
 * Prefers the issuing admin, then any active prop_firm_admin on the tenant.
 */
async function resolvePropFirmNotifyRecipient(
  propFirmId: string,
  options?: {
    overrideEmail?: string;
    issuedByUserId?: string;
  },
): Promise<{ email: string; name?: string } | null> {
  if (options?.overrideEmail) {
    return { email: options.overrideEmail.toLowerCase() };
  }

  if (options?.issuedByUserId) {
    const issuer = await prisma.user.findFirst({
      where: {
        id: options.issuedByUserId,
        tenantId: propFirmId,
        isActive: true,
      },
      select: { email: true, displayName: true },
    });
    if (issuer?.email) {
      return {
        email: issuer.email.toLowerCase(),
        name: issuer.displayName || undefined,
      };
    }
  }

  const admin = await prisma.user.findFirst({
    where: {
      tenantId: propFirmId,
      role: "prop_firm_admin",
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
    select: { email: true, displayName: true },
  });

  if (!admin?.email) return null;
  return {
    email: admin.email.toLowerCase(),
    name: admin.displayName || undefined,
  };
}

/**
 * Send the trader their login credentials and challenge summary.
 */
export async function sendTraderCredentials(
  input: ProvisioningEmailInput,
): Promise<{ messageId: string }> {
  const supportContact = resolveSupportContact(input);
  const context = buildContext(input, supportContact);
  const rendered = renderTraderCredentialsEmail({
    account: input.account,
    credentials: input.credentials,
    context,
  });

  const result = await deliverEmail({
    to: input.account.traderEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return { messageId: result.id };
}

/**
 * Optional confirmation copy for the prop firm admin who issued the account.
 */
export async function sendPropFirmNotification(
  input: ProvisioningEmailInput,
): Promise<{ messageId: string; recipient: string }> {
  const supportContact = resolveSupportContact(input);

  const recipient = await resolvePropFirmNotifyRecipient(input.propFirmId, {
    overrideEmail: input.propFirmNotifyEmail,
    issuedByUserId: input.issuedByUserId,
  });

  if (!recipient) {
    throw new Error("No prop firm admin email found for notification.");
  }

  const context = buildContext(input, supportContact, recipient.name);
  const rendered = renderPropFirmNotificationEmail({
    account: input.account,
    credentials: input.credentials,
    context,
    recipientEmail: recipient.email,
  });

  const result = await deliverEmail({
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return { messageId: result.id, recipient: recipient.email };
}

/**
 * Send trader welcome email, then optionally notify the issuing prop firm admin.
 * Prop firm notification failures are logged but do not fail provisioning.
 */
export async function sendProvisioningEmails(
  input: ProvisioningEmailInput,
): Promise<ProvisioningEmailResult> {
  const result: ProvisioningEmailResult = {
    trader: { sent: false },
    propFirm: { sent: false },
  };

  try {
    const trader = await sendTraderCredentials(input);
    result.trader = { sent: true, messageId: trader.messageId };
  } catch (error) {
    console.error("[email] Trader credentials email failed:", error);
    throw error;
  }

  if (input.notifyPropFirm === false) {
    return result;
  }

  try {
    const firm = await sendPropFirmNotification(input);
    result.propFirm = {
      sent: true,
      messageId: firm.messageId,
      recipient: firm.recipient,
    };
  } catch (error) {
    console.error("[email] Prop firm notification failed (non-fatal):", error);
  }

  return result;
}
