import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getMarket } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tenant = getTenantFromRequest(request);
  const base = getBackendUrl();

  if (base) {
    try {
      const response = await fetch(`${base}/api/v1/trading/markets/${id}`, {
        headers: { "X-Tenant-Slug": tenant.slug },
        cache: "no-store",
      });
      if (response.ok) {
        return NextResponse.json(await response.json());
      }
    } catch {
      // Fall through to local store.
    }
  }

  const market = getMarket(id);
  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  return NextResponse.json({ market });
}
