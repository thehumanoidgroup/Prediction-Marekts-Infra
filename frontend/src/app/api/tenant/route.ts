import { NextRequest, NextResponse } from "next/server";
import { fetchTenantConfig } from "@/lib/tenant-api";
import { getTenantFromRequest, getTenantSlugFromRequest } from "@/lib/tenant-request";

/** Public tenant config for the resolved firm (database-backed when available). */
export async function GET(request: NextRequest) {
  const slug = getTenantSlugFromRequest(request);
  const remote = await fetchTenantConfig(slug);
  if (remote) return NextResponse.json({ tenant: remote });
  return NextResponse.json({ tenant: getTenantFromRequest(request) });
}
