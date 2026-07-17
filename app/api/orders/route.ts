import { NextRequest, NextResponse } from "next/server";
import { getHybridMarket } from "@/lib/hybrid-markets";
import { previewOrderRisk } from "@/lib/provisioning/order-preview";
import { getPortfolioSummary, getPositions, placeOrder } from "@/services";
import type { Outcome } from "@/types";
import { getTenantFromRequest, getTenantSlugFromRequest } from "@/lib/tenant-request";

async function bridgePortfolioEvent(
  request: NextRequest,
  payload: Record<string, unknown>,
) {
  const backend = process.env.PP_API_URL ?? process.env.API_URL;
  if (!backend) return;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Tenant-Slug": getTenantSlugFromRequest(request),
      Accept: "application/json",
    };
    const auth = request.headers.get("authorization");
    if (auth) headers.Authorization = auth;
    await fetch(`${backend.replace(/\/$/, "")}/api/trader/portfolio/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // Local portfolio event still fires from the client.
  }
}

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
    !marketId.trim() ||
    (outcome !== "yes" && outcome !== "no") ||
    (side !== "buy" && side !== "sell") ||
    typeof shares !== "number" ||
    !Number.isFinite(shares) ||
    shares <= 0 ||
    !Number.isInteger(shares)
  ) {
    return NextResponse.json(
      {
        error:
          "Expected { marketId, outcome: yes|no, side: buy|sell, shares: positive integer }",
      },
      { status: 400 },
    );
  }

  if (typeof yesPrice === "number" && (!Number.isFinite(yesPrice) || yesPrice <= 0 || yesPrice >= 1)) {
    return NextResponse.json(
      { error: "yesPrice must be a probability between 0 and 1 when provided" },
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

    const positions = getPositions(tenant.id);
    const summary = getPortfolioSummary(tenant.id);
    const enriched =
      positions.find((p) => p.marketId === marketId && p.outcome === outcome) ?? null;

    const payload = {
      ...result,
      position: enriched,
      positions,
      summary: {
        ...summary,
        totalValue: summary.equity,
        positionsValue: positions.reduce((sum, p) => sum + p.value, 0),
        openPositions: positions.length,
        numberOfOpenPositions: positions.length,
      },
    };

    void bridgePortfolioEvent(request, {
      eventType: side === "buy" && enriched ? "new_position" : "portfolio_update",
      reason:
        side === "buy" ? "order_filled" : enriched ? "position_updated" : "position_closed",
      position: enriched ?? undefined,
      order: result.order,
      summary: payload.summary,
      marketId,
      positions,
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
