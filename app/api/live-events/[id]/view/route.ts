import { NextResponse } from "next/server";

/** View tracking is a no-op in the single-app deployment (no analytics backend). */
export async function POST() {
  return new NextResponse(null, { status: 204 });
}
