import { NextRequest, NextResponse } from "next/server";
import { decodeAccessToken, getBearerToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  await ensureSeeded();
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await decodeAccessToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    role: user.role,
    tenant_id: user.tenantId,
  });
}
