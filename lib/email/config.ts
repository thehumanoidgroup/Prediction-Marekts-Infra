/** Email delivery configuration for provisioning notifications. */

export interface EmailConfig {
  enabled: boolean;
  from: string;
  supportContact: string;
  appUrl: string;
  provider: "resend" | "console";
}

export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.RESEND_API_KEY;
  const explicitOff = process.env.PROVISIONING_EMAILS_ENABLED === "false";

  const from =
    process.env.EMAIL_FROM ?? "PropPredict <onboarding@resend.dev>";
  const supportContact =
    process.env.SUPPORT_EMAIL ??
    process.env.SUPPORT_CONTACT ??
    "support@proppredict.com";
  const appUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const enabled = !explicitOff && Boolean(apiKey || process.env.NODE_ENV !== "production");

  return {
    enabled,
    from,
    supportContact,
    appUrl: appUrl.replace(/\/$/, ""),
    provider: apiKey ? "resend" : "console",
  };
}
