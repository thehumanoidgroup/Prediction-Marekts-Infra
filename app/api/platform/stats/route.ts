import { NextResponse } from "next/server";
import { getPlatformStats } from "@/lib/services";

/** Platform-wide KPI snapshot (SuperAdmin-gated in production). */
export async function GET() {
  return NextResponse.json(getPlatformStats());
}
