import { NextRequest, NextResponse } from "next/server";
import { getAccount, getPortfolioSummary, getPositions } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  return NextResponse.json({
    account: getAccount(tenant.id),
    positions: getPositions(tenant.id),
    summary: getPortfolioSummary(tenant.id),
  });
}
