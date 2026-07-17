import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import {
  getTemplateForModel,
  resetTemplateToDefaults,
  saveOrUpdateTemplate,
} from "@/lib/provisioning/challenge-template-service";
import {
  challengeTemplateModelTypeSchema,
  challengeTemplateSaveSchema,
} from "@/lib/schemas/challenge-template";
import { getTenantSlugFromRequest } from "@/lib/tenant-request";

async function resolveTenantId(slug: string): Promise<string | null> {
  const row = await prisma.tenant.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

type RouteContext = { params: Promise<{ modelType: string }> };

/**
 * GET /api/admin/challenge-templates/[modelType]
 */
export async function GET(request: NextRequest, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { modelType: raw } = await context.params;
  const parsedType = challengeTemplateModelTypeSchema.safeParse(raw);
  if (!parsedType.success) {
    return NextResponse.json({ error: "Invalid model type" }, { status: 422 });
  }

  await ensureSeeded();
  const slug = getTenantSlugFromRequest(request);
  const tenantId = await resolveTenantId(slug);
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const template = await getTemplateForModel(tenantId, parsedType.data);
  return NextResponse.json({ template });
}

/**
 * PUT /api/admin/challenge-templates/[modelType]
 * Save or update the firm template for one model type.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { modelType: raw } = await context.params;
  const parsedType = challengeTemplateModelTypeSchema.safeParse(raw);
  if (!parsedType.success) {
    return NextResponse.json({ error: "Invalid model type" }, { status: 422 });
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

  const parsed = challengeTemplateSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const template = await saveOrUpdateTemplate(tenantId, parsedType.data, parsed.data);
  return NextResponse.json({ template });
}

/**
 * DELETE /api/admin/challenge-templates/[modelType]
 * Reset to platform defaults (removes the saved firm row).
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { modelType: raw } = await context.params;
  const parsedType = challengeTemplateModelTypeSchema.safeParse(raw);
  if (!parsedType.success) {
    return NextResponse.json({ error: "Invalid model type" }, { status: 422 });
  }

  await ensureSeeded();
  const slug = getTenantSlugFromRequest(_request);
  const tenantId = await resolveTenantId(slug);
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const template = await resetTemplateToDefaults(tenantId, parsedType.data);
  return NextResponse.json({ template });
}
