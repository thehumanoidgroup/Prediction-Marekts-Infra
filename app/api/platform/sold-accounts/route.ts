import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { listPropFirmAccounts } from "@/lib/provisioning/accounts";
import { provisioningDbUnavailable } from "@/lib/provisioning/route-auth";
import { defaultVirtualBalance } from "@/lib/provisioning/serialize";
import { prisma } from "@/lib/db";

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json([]);

  await ensureSeeded();

  const { accounts } = await listPropFirmAccounts({ page: 1, pageSize: 200 });
  const firmIds = [...new Set(accounts.map((account) => account.propFirmId))];
  const firms = await prisma.tenant.findMany({
    where: { id: { in: firmIds } },
    select: { id: true, slug: true, name: true },
  });
  const firmMap = new Map(firms.map((firm) => [firm.id, firm]));

  return NextResponse.json(
    accounts.map((account) => {
      const firm = firmMap.get(account.propFirmId);
      const rules = account.challengeConfig?.otherCustomRules ?? {};
      return {
        id: account.id,
        created_at: account.createdAt,
        tenant_slug: firm?.slug ?? null,
        tenant_name: firm?.name ?? null,
        trader_demo_account_id: account.traderDemoAccount?.id ?? null,
        provider: String(rules.provider ?? "kalshi"),
        issuance_source: "manual",
        account_size: defaultVirtualBalance(account.accountSize),
        model_type: account.modelType,
        trader_email: account.traderEmail,
        trader_display_name: account.traderEmail.split("@")[0],
        external_order_id: null,
        kalshi_market_tickers: null,
        credentials_generated: true,
        email_sent: Boolean(account.credentialsSentAt),
      };
    }),
  );
}
