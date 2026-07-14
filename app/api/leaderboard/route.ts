import { NextRequest, NextResponse } from "next/server";
import { getTenantLeaderboard } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  return NextResponse.json({ leaderboard: getTenantLeaderboard(tenant.id) });
}
