import { NextRequest, NextResponse } from "next/server";
import { getTenantFromRequest } from "@/lib/tenant-request";

export function GET(request: NextRequest) {
  return NextResponse.json({ tenant: getTenantFromRequest(request) });
}
