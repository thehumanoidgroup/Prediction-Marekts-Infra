import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getRequestTenant } from "@/lib/tenant-server";

/** Prop Firm Admin: manually provision an evaluation account. */
export async function POST(request: NextRequest) {
  const base = getBackendUrl();
  if (!base) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tenant = await getRequestTenant();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-Slug": tenant.slug,
  };

  try {
    const response = await fetch(`${base}/api/v1/admin/accounts/provision`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
