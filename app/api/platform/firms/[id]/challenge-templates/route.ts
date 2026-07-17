import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { getFirmDetail } from "@/lib/services";
import { getAllTemplatesForPropFirm } from "@/lib/provisioning/challenge-template-service";

/**
 * GET /api/platform/firms/[id]/challenge-templates
 *
 * Super Admin — read-only challenge templates for a prop firm (support / audit).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { id } = await params;
  const firm = getFirmDetail(id);
  if (!firm) {
    return NextResponse.json({ error: "Firm not found" }, { status: 404 });
  }

  await ensureSeeded();
  const tenant = await prisma.tenant.findFirst({
    where: {
      isActive: true,
      OR: [{ id: firm.id }, { slug: firm.slug }],
    },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found in database" }, { status: 404 });
  }

  const templates = await getAllTemplatesForPropFirm(tenant.id);
  return NextResponse.json({
    firm: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    templates,
    readOnly: true,
  });
}
