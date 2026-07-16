import { NextRequest, NextResponse } from "next/server";
import { listSp500ChallengeTemplates } from "@/lib/sp500/challenge-templates";
import type { ChallengeTemplate } from "@/lib/account-provisioning";

/**
 * GET /api/admin/accounts/templates?provider=sp500_dynamic|kalshi|...
 *
 * Returns reusable challenge templates for the Issue New Account form.
 * S&P 500 stock-event templates are built-in; other providers start empty
 * until firm-specific templates are seeded.
 */
export async function GET(request: NextRequest) {
  const provider = (request.nextUrl.searchParams.get("provider") ?? "kalshi").toLowerCase();

  let templates: ChallengeTemplate[] = [];
  if (provider === "sp500_dynamic") {
    templates = listSp500ChallengeTemplates();
  }

  return NextResponse.json(templates);
}
