import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getRequestTenant } from "@/lib/tenant-server";

export async function POST(request: NextRequest) {
  const base = getBackendUrl();
  if (!base) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  }

  const tenant = await getRequestTenant();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const response = await fetch(`${base}/api/v1/admin/accounts/preview-rules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": tenant.slug,
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
