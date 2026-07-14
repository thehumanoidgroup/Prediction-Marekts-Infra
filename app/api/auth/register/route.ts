import { NextRequest, NextResponse } from "next/server";
import { createAccessToken, getBearerToken, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { getTenantSlugFromRequest } from "@/lib/tenant-request";

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureSeeded();
  const slug = getTenantSlugFromRequest(request);

  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const displayName = body.displayName?.trim();

  if (!email || !password || !displayName) {
    return NextResponse.json({ error: "email, password, and displayName are required" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      displayName,
      hashedPassword: await hashPassword(password),
      role: "trader",
    },
  });

  const accessToken = await createAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });

  return NextResponse.json({ access_token: accessToken }, { status: 201 });
}
