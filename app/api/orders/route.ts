import { NextRequest, NextResponse } from "next/server";
import { getHybridMarket } from "@/lib/hybrid-markets";
import { previewOrderRisk } from "@/lib/provisioning/order-preview";
import { placeOrder } from "@/services";
import type { Outcome } from "@/types";
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
      { error: "Expected { marketId, outcome: yes|no, side: buy|sell, shares: number }" },
      { status: 400 },
    );
  }

  try {
    const market = await getHybridMarket(marketId);
    if (!market) {
      return NextResponse.json({ error: `Unknown market: ${marketId}` }, { status: 404 });
    }

    const quotedYes =
      typeof yesPrice === "number" && Number.isFinite(yesPrice) ? yesPrice : market.yesPrice;

    // Same challenge risk path for internal / Kalshi / S&P 500 virtual bets.
    const risk = await previewOrderRisk({
      tenantId: tenant.id,
      marketId,
      outcome: outcome as Outcome,
      side,
      shares,
      yesPrice: quotedYes,
    });
    if (!risk.allowed) {
      return NextResponse.json(
        { error: risk.reasons[0] ?? risk.violations[0] ?? "Order rejected by risk engine", risk },
        { status: 422 },
      );
    }

    const result = placeOrder(tenant.id, {
      marketId,
      outcome: outcome as Outcome,
      side,
      shares,
      market,
      yesPrice: typeof yesPrice === "number" ? yesPrice : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
