import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function POST(request: NextRequest) {
  const tenant = getTenantFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { marketId, outcome, side, shares, yesPrice } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof marketId !== "string" ||
    (outcome !== "yes" && outcome !== "no") ||
    (side !== "buy" && side !== "sell") ||
    typeof shares !== "number"
  ) {
    return NextResponse.json(
      { error: "Expected { marketId, outcome, side, shares, yesPrice? }" },
      { status: 400 },
    );
  }

  const base = getBackendUrl();
  if (!base) {
    return NextResponse.json({ preview: { allowed: true, reasons: [], violations: [], stake: 0, side } });
  }

  try {
    const response = await fetch(`${base}/api/v1/trading/orders/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": tenant.slug,
      },
      body: JSON.stringify({ marketId, outcome, side, shares, yesPrice }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Preview failed" },
        { status: response.status },
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
