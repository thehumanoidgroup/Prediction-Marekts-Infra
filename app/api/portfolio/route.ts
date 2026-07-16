import { NextRequest, NextResponse } from "next/server";
import { hydrateTenantPortfolio } from "@/lib/portfolio-persistence";
import { getAccount, getPortfolioSummary, getPositions } from "@/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  await hydrateTenantPortfolio(tenant.id);

  return NextResponse.json({
    account: getAccount(tenant.id),
    positions: getPositions(tenant.id),
    summary: getPortfolioSummary(tenant.id),
  });
}
