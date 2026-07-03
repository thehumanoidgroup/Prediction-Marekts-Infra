import { NextRequest, NextResponse } from "next/server";
import { createMarket } from "@/lib/services";
import type { MarketCategory } from "@/lib/types";

/** Admin market-template endpoint (PropFirmAdmin-gated in production). */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { question, category, initialProbability, closesAt } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (
    typeof question !== "string" ||
    typeof category !== "string" ||
    typeof initialProbability !== "number" ||
    typeof closesAt !== "number"
  ) {
    return NextResponse.json(
      { error: "Expected { question, category, initialProbability, closesAt }" },
      { status: 400 },
    );
  }

  try {
    const market = createMarket({
      question,
      category: category as MarketCategory,
      initialProbability,
      closesAt,
    });
    return NextResponse.json({ market }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create market";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
