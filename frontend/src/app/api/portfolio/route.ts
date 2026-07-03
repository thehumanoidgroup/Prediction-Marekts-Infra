import { NextRequest, NextResponse } from "next/server";
import { fetchBackendPortfolio } from "@/lib/api-server";
import { getAccount, getPortfolioSummary, getPositions } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  const remote = await fetchBackendPortfolio(tenant.slug);
  if (remote) return NextResponse.json(remote);

  return NextResponse.json({
    account: getAccount(tenant.id),
    positions: getPositions(tenant.id),
    summary: getPortfolioSummary(tenant.id),
  });
}
