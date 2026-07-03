import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: "proppredict",
    environment: process.env.NODE_ENV ?? "development",
  });
}
