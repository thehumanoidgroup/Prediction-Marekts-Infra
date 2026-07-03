import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import {
  getOrCreateFirmSettings,
  patchFirmSettings,
} from "@/lib/provisioning/firm-settings";
import { propFirmSettingsPatchSchema } from "@/lib/schemas/firm-settings";
import { getTenantSlugFromRequest } from "@/lib/tenant-request";

async function resolveTenantId(slug: string): Promise<string | null> {
  const row = await prisma.tenant.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * GET /api/admin/provisioning-settings
 * PATCH /api/admin/provisioning-settings
 *
 * Prop Firm Admin — default rules per model type, allowed sizes, override policy.
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureSeeded();
  const slug = getTenantSlugFromRequest(request);
  const tenantId = await resolveTenantId(slug);
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const settings = await getOrCreateFirmSettings(tenantId);
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureSeeded();
  const slug = getTenantSlugFromRequest(request);
  const tenantId = await resolveTenantId(slug);
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = propFirmSettingsPatchSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const settings = await patchFirmSettings(tenantId, parsed);
  return NextResponse.json({ settings });
}
