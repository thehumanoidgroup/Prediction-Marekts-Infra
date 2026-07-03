/**
 * Authentication helpers for provisioning API routes.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { decodeAccessToken, getBearerToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractApiKeyFromRequest, verifyPropFirmApiKey } from "@/lib/provisioning/api-keys";

export interface WebhookAuthContext {
  tenantId: string;
  keyId: string;
}

export interface AdminAuthContext {
  userId: string;
  role: UserRole;
  tenantId: string | null;
}

export function provisioningDbUnavailable(): NextResponse {
  return NextResponse.json({ error: "Database not configured" }, { status: 503 });
}

/** Authenticate a prop firm webhook via per-firm API key. */
export async function authenticateWebhook(
  request: NextRequest,
  expectedPropFirmId: string,
): Promise<WebhookAuthContext | NextResponse> {
  const presented = extractApiKeyFromRequest(request);
  if (!presented) {
    return NextResponse.json(
      { error: "Missing API key. Send X-API-Key or Authorization: Bearer <key>." },
      { status: 401 },
    );
  }

  const verified = await verifyPropFirmApiKey(presented);
  if (!verified) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }

  if (verified.tenantId !== expectedPropFirmId) {
    return NextResponse.json(
      { error: "API key does not match prop_firm_id." },
      { status: 403 },
    );
  }

  const firm = await prisma.tenant.findFirst({
    where: { id: expectedPropFirmId, isActive: true },
  });
  if (!firm) {
    return NextResponse.json({ error: "Prop firm not found." }, { status: 404 });
  }

  return verified;
}

/** Require Super Admin JWT (Bearer token). */
export async function requireSuperAdmin(
  request: NextRequest,
): Promise<AdminAuthContext | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await decodeAccessToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  if (payload.role !== "super_admin") {
    return NextResponse.json({ error: "Super Admin access required." }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.isActive) {
    return NextResponse.json({ error: "User not found." }, { status: 401 });
  }

  return {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
  };
}

export function isAuthError(
  value: WebhookAuthContext | AdminAuthContext | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
