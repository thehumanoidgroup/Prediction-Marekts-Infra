import { NextRequest, NextResponse } from "next/server";
import { processProvisioningJob } from "@/services/provisioning-worker";

/**
 * POST /api/internal/provisioning/process
 *
 * Background worker for the database-backed provisioning queue.
 * Secured with `PROVISIONING_WORKER_SECRET` (Bearer token).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PROVISIONING_WORKER_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "PROVISIONING_WORKER_SECRET is required in production" },
      { status: 503 },
    );
  }

  let jobId: string | undefined;
  try {
    const body = await request.json();
    jobId = typeof body?.jobId === "string" ? body.jobId : undefined;
  } catch {
    // drain next pending job when body omitted
  }

  const result = await processProvisioningJob(jobId);
  return NextResponse.json(result, { status: result.processed ? 200 : 204 });
}
