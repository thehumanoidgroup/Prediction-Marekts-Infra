/**
 * Provisioning email service.
 *
 * Equivalent of the requested `backend/services/email_service.py`.
 * Uses Resend in production; logs to console when `RESEND_API_KEY` is unset.
 */

import { deliverEmail } from "@/lib/email/send";
import {
  renderPropFirmNotificationEmail,
  renderTraderCredentialsEmail,
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
  /** Override prop firm notification recipient. */
  propFirmNotifyEmail?: string;
}

export interface ProvisioningEmailResult {
  trader: { sent: boolean; messageId?: string };
  propFirm: { sent: boolean; messageId?: string; recipient?: string };
}

function buildContext(
  input: ProvisioningEmailInput,
  supportContact: string,
): EmailTemplateContext {
  return {
    firmName: input.firmName,
    supportContact,
    appUrl:
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000",
    virtualBalance: input.virtualBalance,
    challengeConfig: input.challengeConfig,
  };
}

async function resolvePropFirmNotifyEmail(
  propFirmId: string,
  override?: string,
): Promise<string | null> {
  if (override) return override.toLowerCase();

  const admin = await prisma.user.findFirst({
    where: {
      tenantId: propFirmId,
      role: "prop_firm_admin",
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return admin?.email.toLowerCase() ?? null;
}

/**
 * Send the trader their login credentials and challenge summary.
 */
export async function sendTraderCredentials(
  input: ProvisioningEmailInput,
): Promise<{ messageId: string }> {
  const supportContact =
    input.supportContact ??
    process.env.SUPPORT_EMAIL ??
    process.env.SUPPORT_CONTACT ??
    "support@proppredict.com";

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
 * Notify the prop firm that an account was provisioned for a trader.
 */
export async function sendPropFirmNotification(
  input: ProvisioningEmailInput,
): Promise<{ messageId: string; recipient: string }> {
  const supportContact =
    input.supportContact ??
    process.env.SUPPORT_EMAIL ??
    process.env.SUPPORT_CONTACT ??
    "support@proppredict.com";

  const recipient = await resolvePropFirmNotifyEmail(
    input.propFirmId,
    input.propFirmNotifyEmail,
  );

  if (!recipient) {
    throw new Error("No prop firm admin email found for notification.");
  }

  const context = buildContext(input, supportContact);
  const rendered = renderPropFirmNotificationEmail({
    account: input.account,
    credentials: input.credentials,
    context,
    recipientEmail: recipient,
  });

  const result = await deliverEmail({
    to: recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return { messageId: result.id, recipient };
}

/**
 * Send both provisioning emails after a successful account setup.
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
