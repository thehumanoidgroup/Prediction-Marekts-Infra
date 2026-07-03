import { NextResponse } from "next/server";
import { listFirmOverviews } from "@/lib/services";

/** All prop firms with key metrics (SuperAdmin). */
export async function GET() {
  return NextResponse.json({ firms: listFirmOverviews() });
}
