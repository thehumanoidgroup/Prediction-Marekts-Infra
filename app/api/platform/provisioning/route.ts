import { NextResponse } from "next/server";

/** @deprecated Use `/api/provisioning/*` routes instead. */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated.",
      use: {
        webhook: "POST /api/provisioning/webhook",
        manual: "POST /api/provisioning/manual",
        list: "GET /api/provisioning/accounts",
      },
    },
    { status: 410, headers: { Deprecation: "true" } },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Moved to GET /api/provisioning/accounts",
      links: {
        list: "/api/provisioning/accounts",
        webhook: "/api/provisioning/webhook",
        manual: "/api/provisioning/manual",
      },
    },
    { status: 410 },
  );
}
