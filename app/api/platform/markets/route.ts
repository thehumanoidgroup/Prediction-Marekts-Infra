import { NextRequest, NextResponse } from "next/server";
import { createGlobalMarket, listGlobalMarketTemplates } from "@/lib/services";
import type { MarketCategory } from "@/lib/types";

/** Global market templates (SuperAdmin). */
export async function GET() {
  return NextResponse.json({ templates: listGlobalMarketTemplates() });
}

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
    const template = createGlobalMarket({
      question,
      category: category as MarketCategory,
      initialProbability,
      closesAt,
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create template";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
