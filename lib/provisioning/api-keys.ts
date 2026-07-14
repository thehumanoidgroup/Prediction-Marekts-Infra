/**
 * Prop firm webhook API key management.
 *
 * Keys are issued per tenant and verified via `X-API-Key` or `Authorization: Bearer`.
 * Only a bcrypt hash and a short prefix are stored.
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";

const KEY_PREFIX_LABEL = "ppk_";

export interface GeneratedApiKey {
  /** Full key — show once to the prop firm operator. */
  rawKey: string;
  prefix: string;
  id: string;
}

function buildRawKey(): { rawKey: string; prefix: string } {
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `${KEY_PREFIX_LABEL}${secret}`;
  const prefix = rawKey.slice(0, 16);
  return { rawKey, prefix };
}

/** Create and persist a new webhook API key for a prop firm. */
export async function createPropFirmApiKey(
  tenantId: string,
  label = "default",
): Promise<GeneratedApiKey> {
  const { rawKey, prefix } = buildRawKey();
  const keyHash = await hashPassword(rawKey);

  const row = await prisma.propFirmApiKey.create({
    data: { tenantId, label, keyPrefix: prefix, keyHash },
  });

  return { rawKey, prefix, id: row.id };
}

/** Resolve tenant from a presented API key. Returns null when invalid. */
export async function verifyPropFirmApiKey(
  presentedKey: string,
): Promise<{ tenantId: string; keyId: string } | null> {
  const trimmed = presentedKey.trim();
  if (!trimmed.startsWith(KEY_PREFIX_LABEL) || trimmed.length < 20) {
    return null;
  }

  const prefix = trimmed.slice(0, 16);
  const row = await prisma.propFirmApiKey.findFirst({
    where: { keyPrefix: prefix, isActive: true },
  });

  if (!row) return null;

  const valid = await verifyPassword(trimmed, row.keyHash);
  if (!valid) return null;

  await prisma.propFirmApiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return { tenantId: row.tenantId, keyId: row.id };
}

export function extractApiKeyFromRequest(request: Request): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey?.trim()) return headerKey.trim();

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith(KEY_PREFIX_LABEL)) return token;
  }

  return null;
}

/** Deterministic dev-only key fingerprint for logging (never log raw keys). */
export function apiKeyFingerprint(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex").slice(0, 12);
}
