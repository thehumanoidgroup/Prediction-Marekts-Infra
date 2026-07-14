import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

const ALGORITHM = "HS256";
const EXPIRY = "24h";

export interface TokenPayload {
  sub: string;
  tid: string | null;
  role: UserRole;
}

function getSecret(): Uint8Array {
  const secret = process.env.SECRET_KEY ?? process.env.PP_SECRET_KEY;
  if (!secret || secret === "change-me-in-production") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SECRET_KEY must be set in production.");
    }
  }
  return new TextEncoder().encode(secret ?? "dev-secret-change-me");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export async function createAccessToken(payload: {
  userId: string;
  tenantId: string | null;
  role: UserRole;
}): Promise<string> {
  return new SignJWT({
    tid: payload.tenantId,
    role: payload.role,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function decodeAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: String(payload.sub),
      tid: payload.tid ? String(payload.tid) : null,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}
