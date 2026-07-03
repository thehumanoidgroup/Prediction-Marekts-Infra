/**
 * AES-256-GCM encryption for trader demo login credentials at rest.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { TraderLoginCredentials } from "@/types/provisioning";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function deriveKey(): Buffer {
  const secret =
    process.env.CREDENTIALS_ENCRYPTION_KEY ??
    process.env.SECRET_KEY ??
    process.env.PP_SECRET_KEY ??
    "dev-credentials-key-change-me";

  return createHash("sha256").update(secret).digest();
}

/** Encrypt credentials to a base64 payload: iv.tag.ciphertext */
export function encryptLoginCredentials(credentials: TraderLoginCredentials): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Decrypt credentials stored on TraderDemoAccount (server-side only). */
export function decryptLoginCredentials(payload: string): TraderLoginCredentials {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, IV_BYTES);
  const tag = buffer.subarray(IV_BYTES, IV_BYTES + 16);
  const ciphertext = buffer.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(decrypted) as TraderLoginCredentials;
}
