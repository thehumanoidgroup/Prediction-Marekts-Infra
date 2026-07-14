import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  isAuthError,
  provisioningDbUnavailable,
  requireSuperAdmin,
} from "@/lib/provisioning/route-auth";
import { getProvisioningJob } from "@/lib/provisioning/queue";

/**
 * GET /api/provisioning/jobs/[id]
 *
 * Poll async provisioning job status (Super Admin JWT).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  const admin = await requireSuperAdmin(request);
  if (isAuthError(admin)) return admin;

  const { id } = await params;
  const job = await getProvisioningJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const row = await prisma.provisioningJob.findUnique({
    where: { id },
    select: { result: true },
  });

  return NextResponse.json({
    job,
    result: row?.result ?? null,
  });
}
