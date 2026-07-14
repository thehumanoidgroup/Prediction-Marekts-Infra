import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getRequestTenant } from "@/lib/tenant-server";

export async function GET(request: NextRequest) {
  const base = getBackendUrl();
  if (!base) return NextResponse.json([]);

  const tenant = await getRequestTenant();
  const params = request.nextUrl.searchParams.toString();
  const suffix = params ? `?${params}` : "";

  try {
    const response = await fetch(`${base}/api/v1/admin/accounts/templates${suffix}`, {
      headers: { "X-Tenant-Slug": tenant.slug },
      cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
