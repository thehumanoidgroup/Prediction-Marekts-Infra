import { NextRequest, NextResponse } from "next/server";
import { createAccessToken, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { getTenantSlugFromRequest } from "@/lib/tenant-request";

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureSeeded();
  const slug = getTenantSlugFromRequest(request);

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const user = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
  });

  if (!user || !(await verifyPassword(password, user.hashedPassword))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!user.isActive) {
    return NextResponse.json({ error: "Account is deactivated" }, { status: 403 });
  }

  const accessToken = await createAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });

  return NextResponse.json({ access_token: accessToken });
}
