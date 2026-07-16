import { NextRequest, NextResponse } from "next/server";
import { listFallbackLiveEvents, listLiveEvents } from "@/lib/live-events";
import type { MarketCategory, MarketViewSource } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = (params.get("category") as MarketCategory | null) ?? "all";
  const source = (params.get("source") as MarketViewSource | null) ?? "all";
  const refresh = params.get("refresh") === "true";

  try {
    const payload = await listLiveEvents({ category, source, refresh });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[live-events]", error);
    return NextResponse.json(listFallbackLiveEvents({ category, source }));
  }
}
