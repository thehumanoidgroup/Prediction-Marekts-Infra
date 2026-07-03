import { NextResponse } from "next/server";
import { getPlatformActivity } from "@/lib/services";

/** Recent platform-wide activity feed (SuperAdmin). */
export async function GET() {
  const activity = await getPlatformActivity();
  return NextResponse.json({ activity });
}
