import { NextRequest, NextResponse } from "next/server";
import { postBackendOrder } from "@/lib/api-server";
import { placeOrder } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function POST(request: NextRequest) {
  const tenant = getTenantFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { marketId, outcome, side, shares } = (body ?? {}) as Record<string, unknown>;
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

  const remote = await postBackendOrder(tenant.slug, {
    marketId,
    outcome,
    side,
    shares,
  });
  if (remote) return NextResponse.json(remote, { status: 201 });

  try {
    const result = placeOrder(tenant.id, { marketId, outcome, side, shares });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
