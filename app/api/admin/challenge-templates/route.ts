import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { getAllTemplatesForPropFirm } from "@/lib/provisioning/challenge-template-service";
import { getTenantSlugFromRequest } from "@/lib/tenant-request";

async function resolveTenantId(slug: string): Promise<string | null> {
  const row = await prisma.tenant.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * GET /api/admin/challenge-templates
 *
 * List all four model-type templates (saved rows + platform defaults).
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

  const templates = await getAllTemplatesForPropFirm(tenantId);
  return NextResponse.json({ templates });
}
