import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getRequestTenant } from "@/lib/tenant-server";

async function proxy(
  request: NextRequest,
  path: string,
  init?: RequestInit,
): Promise<NextResponse> {
  const base = getBackendUrl();
  if (!base) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 503 });
  }

  const tenant = await getRequestTenant();
  const headers: Record<string, string> = {
    "X-Tenant-Slug": tenant.slug,
    ...(init?.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(`${base}${path}`, { ...init, headers });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  const suffix = params ? `?${params}` : "";
  return proxy(request, `/api/v1/admin/accounts/sold${suffix}`);
}
