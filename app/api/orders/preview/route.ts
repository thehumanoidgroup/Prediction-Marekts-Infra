import { NextRequest, NextResponse } from "next/server";
import { getTenantFromRequest } from "@/lib/tenant-request";
import { previewOrderRisk } from "@/lib/provisioning/order-preview";
import type { Outcome } from "@/types";

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

  const preview = await previewOrderRisk({
    tenantId: tenant.id,
    marketId,
    outcome: outcome as Outcome,
    side,
    shares,
    yesPrice: typeof yesPrice === "number" ? yesPrice : 0.5,
  });

  return NextResponse.json({ preview });
}
