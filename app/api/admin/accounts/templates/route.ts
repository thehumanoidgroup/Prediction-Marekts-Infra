import { NextResponse } from "next/server";

/** Challenge templates are firm defaults in the single-app stack; none pre-seeded yet. */
export async function GET() {
  return NextResponse.json([]);
}
