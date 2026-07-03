import { NextRequest, NextResponse } from "next/server";
import { getFirmDetail } from "@/lib/services";

/** Single firm drill-down (SuperAdmin). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const firm = getFirmDetail(id);
  if (!firm) {
    return NextResponse.json({ error: "Firm not found" }, { status: 404 });
  }
  return NextResponse.json({ firm });
}
