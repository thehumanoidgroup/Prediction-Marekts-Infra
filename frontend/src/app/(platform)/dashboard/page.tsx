import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { fetchBackendJournal, fetchBackendMarkets, fetchBackendPortfolio } from "@/lib/api-server";
import { getAccount, getJournal, getPortfolioSummary, getPositions, listMarkets } from "@/lib/services";
import { getRequestTenant } from "@/lib/tenant-server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const tenant = await getRequestTenant();

  const remotePortfolio = await fetchBackendPortfolio(tenant.slug);
  const remoteJournal = await fetchBackendJournal(tenant.slug);
  const remoteMarkets = await fetchBackendMarkets(tenant.slug, { sort: "movers" });
  const internalMarketsRemote = await fetchBackendMarkets(tenant.slug, { sort: "volume" });

  const initial = remotePortfolio
    ? {
        account: remotePortfolio.account,
        summary: remotePortfolio.summary,
        positions: remotePortfolio.positions,
        journal: remoteJournal?.journal ?? [],
        movers: remoteMarkets?.markets.slice(0, 5) ?? [],
      }
    : {
        account: getAccount(tenant.id),
        summary: getPortfolioSummary(tenant.id),
        positions: getPositions(tenant.id),
        journal: getJournal(tenant.id).slice(0, 4),
        movers: listMarkets({ sort: "movers" }).slice(0, 5),
      };

  const internalMarkets =
    internalMarketsRemote?.markets ?? listMarkets({ sort: "volume" });

  return (
    <DashboardClient tenant={tenant} initial={initial} internalMarkets={internalMarkets} />
  );
}
