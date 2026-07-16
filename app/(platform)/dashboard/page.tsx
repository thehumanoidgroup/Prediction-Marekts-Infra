import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { hydrateTenantPortfolio } from "@/lib/portfolio-persistence";
import { getAccount, getJournal, getPortfolioSummary, getPositions, listMarkets } from "@/services";
import { getRequestTenant } from "@/lib/tenant-server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const tenant = await getRequestTenant();
  await hydrateTenantPortfolio(tenant.id);

  const initial = {
    account: getAccount(tenant.id),
    summary: getPortfolioSummary(tenant.id),
    positions: getPositions(tenant.id),
    journal: getJournal(tenant.id).slice(0, 4),
    movers: listMarkets({ sort: "movers" }).slice(0, 5),
  };

  return <DashboardClient tenant={tenant} initial={initial} />;
}
