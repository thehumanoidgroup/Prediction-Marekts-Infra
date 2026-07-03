/**
 * AES-256-GCM encryption for trader demo login credentials at rest.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ProvisioningError } from "@/lib/provisioning/errors";
import type { TraderLoginCredentials } from "@/types/provisioning";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Prefix identifies encrypted ciphertext vs legacy/plaintext mistakes. */
export const CREDENTIALS_CIPHERTEXT_PREFIX = "ppv1:";

function deriveKey(): Buffer {
  const secret =
    process.env.CREDENTIALS_ENCRYPTION_KEY ??
    process.env.SECRET_KEY ??
    process.env.PP_SECRET_KEY ??
    "dev-credentials-key-change-me";

  return createHash("sha256").update(secret).digest();
}

/** Fail fast in production when encryption secrets are not configured. */
export function assertCredentialsEncryptionConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;

  const dedicated = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const fallback = process.env.SECRET_KEY ?? process.env.PP_SECRET_KEY;
  const secret = dedicated ?? fallback;

  if (!secret || secret === "change-me-in-production" || secret === "dev-credentials-key-change-me") {
    throw new ProvisioningError({
      code: "ENCRYPTION_NOT_CONFIGURED",
      message: "CREDENTIALS_ENCRYPTION_KEY or SECRET_KEY must be set in production.",
      userMessage:
        "Credential encryption is not configured. Set CREDENTIALS_ENCRYPTION_KEY before provisioning accounts.",
      status: 503,
    });
  }
}

export function isEncryptedCredentialsPayload(payload: string): boolean {
  if (!payload || typeof payload !== "string") return false;

  const encoded = payload.startsWith(CREDENTIALS_CIPHERTEXT_PREFIX)
    ? payload.slice(CREDENTIALS_CIPHERTEXT_PREFIX.length)
    : payload;

  try {
    const buffer = Buffer.from(encoded, "base64");
    return buffer.length >= IV_BYTES + TAG_BYTES + 1;
  } catch {
    return false;
  }
}

/** Encrypt credentials to a versioned base64 payload: ppv1:iv.tag.ciphertext */
export function encryptLoginCredentials(credentials: TraderLoginCredentials): string {
  assertCredentialsEncryptionConfigured();

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return `${CREDENTIALS_CIPHERTEXT_PREFIX}${payload}`;
}

/** Decrypt credentials stored on TraderDemoAccount (server-side only). */
export function decryptLoginCredentials(payload: string): TraderLoginCredentials {
  if (!isEncryptedCredentialsPayload(payload)) {
    throw new ProvisioningError({
      code: "INVALID_CREDENTIALS_PAYLOAD",
      message: "Stored credentials are not a valid encrypted payload.",
      userMessage: "Stored credentials could not be decrypted.",
      status: 500,
    });
  }

  const encoded = payload.startsWith(CREDENTIALS_CIPHERTEXT_PREFIX)
    ? payload.slice(CREDENTIALS_CIPHERTEXT_PREFIX.length)
    : payload;

  const buffer = Buffer.from(encoded, "base64");
  const iv = buffer.subarray(0, IV_BYTES);
  const tag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buffer.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted) as TraderLoginCredentials;
}
