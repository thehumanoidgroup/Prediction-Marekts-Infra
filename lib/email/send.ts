import { Resend } from "resend";
import { getEmailConfig } from "@/lib/email/config";

export interface OutboundEmail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  id: string;
  provider: "resend" | "console";
}

/** Send a transactional email via Resend (or log to console in development). */
export async function deliverEmail(message: OutboundEmail): Promise<SendEmailResult> {
  const config = getEmailConfig();

  if (!config.enabled) {
    console.info("[email] Skipped (PROVISIONING_EMAILS_ENABLED=false)");
    return { id: "skipped", provider: "console" };
  }

  if (config.provider === "console") {
    console.info("[email] Console delivery (set RESEND_API_KEY for production)");
    console.info(`  To: ${Array.isArray(message.to) ? message.to.join(", ") : message.to}`);
    console.info(`  Subject: ${message.subject}`);
    console.info(`  Text:\n${message.text}`);
    return { id: `console-${Date.now()}`, provider: "console" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: config.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  if (error) {
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  return { id: data?.id ?? "unknown", provider: "resend" };
}
