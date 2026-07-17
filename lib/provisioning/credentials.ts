/**
 * Credential generation for newly provisioned trader demo accounts.
 */

import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import type { TraderLoginCredentials } from "@/types/provisioning";

export type LoginDeliveryMode = "password" | "magic_link";

export interface GeneratedCredentials {
  username: string;
  password?: string;
  magicLink?: string;
  loginUrl: string;
  /** Plain payload suitable for one-time email/webhook delivery. */
  delivery: TraderLoginCredentials & { magicLink?: string };
}

function appBaseUrl(tenantSlug?: string): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (tenantSlug) return `https://${tenantSlug}.proppredict.com`;
  return "http://localhost:3000";
}

function buildLoginPageUrl(tenantSlug?: string): string {
  const base = appBaseUrl(tenantSlug);
  return tenantSlug
    ? `${base}/login?tenant=${encodeURIComponent(tenantSlug)}`
    : `${base}/login`;
}

export function generateSecurePassword(length = 20): string {
  return randomBytes(Math.ceil(length * 0.75))
    .toString("base64url")
    .slice(0, length);
}

async function generateMagicLinkToken(
  traderEmail: string,
  propFirmAccountId: string,
): Promise<string> {
  const secret = process.env.SECRET_KEY ?? process.env.PP_SECRET_KEY ?? "dev-secret-change-me";
  return new SignJWT({ email: traderEmail, accountId: propFirmAccountId, purpose: "magic_login" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(traderEmail)
    .setIssuedAt()
    .setExpirationTime("72h")
    .sign(new TextEncoder().encode(secret));
}

/**
 * Generate login credentials for a provisioned account.
 *
 * - `password` mode: username (email) + cryptographically secure password
 * - `magic_link` mode: username + single-use style magic link (72h JWT)
 */
export async function generateLoginCredentials(options: {
  traderEmail: string;
  propFirmAccountId: string;
  tenantSlug?: string;
  mode?: LoginDeliveryMode;
}): Promise<GeneratedCredentials> {
  const loginUrl = buildLoginPageUrl(options.tenantSlug);
  const username = options.traderEmail.toLowerCase();
  const mode = options.mode ?? "password";

  if (mode === "magic_link") {
    const token = await generateMagicLinkToken(username, options.propFirmAccountId);
    const magicLink = `${appBaseUrl(options.tenantSlug)}/login?token=${encodeURIComponent(token)}${
      options.tenantSlug ? `&tenant=${encodeURIComponent(options.tenantSlug)}` : ""
    }`;
    return {
      username,
      magicLink,
      loginUrl,
      delivery: {
        username,
        password: generateSecurePassword(32),
        loginUrl,
        magicLink,
      },
    };
  }

  const password = generateSecurePassword();
  return {
    username,
    password,
    loginUrl,
    delivery: { username, password, loginUrl },
  };
}

/** Deterministic demo username suffix for audit logs (never store raw password). */
export function credentialsFingerprint(password: string): string {
  return createHash("sha256").update(password).digest("hex").slice(0, 16);
}
