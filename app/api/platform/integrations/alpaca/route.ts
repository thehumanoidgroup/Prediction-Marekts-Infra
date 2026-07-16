import { NextResponse } from "next/server";
import { getAlpacaIntegrationStatus } from "@/lib/sp500/service";

/** Super Admin: Alpaca Market Data connection health.
 * Docs: https://alpaca.markets/docs/
 *       https://alpaca.markets/docs/api-references/market-data-api/
 */
export async function GET() {
  const status = await getAlpacaIntegrationStatus();
  return NextResponse.json(status);
}
