import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const tenant = getTenantFromRequest(_request);
  const base = getBackendUrl();

  if (base) {
    try {
      const response = await fetch(`${base}/api/v1/live-events/${encodeURIComponent(id)}/view`, {
        method: "POST",
        headers: { "X-Tenant-Slug": tenant.slug },
      });
      if (!response.ok) {
        return NextResponse.json({ error: "Failed to record view" }, { status: response.status });
      }
      return new NextResponse(null, { status: 204 });
    } catch {
      return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
    }
  }

  return new NextResponse(null, { status: 204 });
}
