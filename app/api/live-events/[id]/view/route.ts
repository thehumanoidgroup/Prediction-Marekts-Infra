import { NextResponse } from "next/server";

/**
 * Record a live-event card view and (for sp500_dynamic) keep the ticker in the
 * viewed set so quote polling / Alpaca WS only covers symbols on screen.
 *
 * Alpaca WebSocket for MVP. Polygon WebSocket ready for later scaling.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const eventId = params.id;
  let stockTicker: string | null = null;
  try {
    const body = (await request.json()) as { stockTicker?: string; source?: string };
    if (body.stockTicker) stockTicker = body.stockTicker.trim().toUpperCase();
  } catch {
    // empty body is fine
  }

  const backend = process.env.PP_API_URL ?? process.env.API_URL;
  if (backend) {
    try {
      await fetch(
        `${backend.replace(/\/$/, "")}/api/v1/live-events/${encodeURIComponent(eventId)}/view`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stock_ticker: stockTicker }),
          cache: "no-store",
        },
      );
    } catch {
      // ignore — Next quote polling still works
    }
  }

  return new NextResponse(null, { status: 204 });
}
