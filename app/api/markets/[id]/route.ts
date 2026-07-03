import { NextRequest, NextResponse } from "next/server";
import { getHybridMarket } from "@/lib/hybrid-markets";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  getTenantFromRequest(request);
  const { id } = await context.params;
  const market = await getHybridMarket(id);

  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  return NextResponse.json({ market });
}
