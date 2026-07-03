import { NextResponse } from "next/server";
import { getPlatformActivity } from "@/lib/services";

/** Recent platform-wide activity feed (SuperAdmin). */
export async function GET() {
  return NextResponse.json({ activity: getPlatformActivity() });
}
