import type { Metadata } from "next";
import { fetchBackendMarkets } from "@/lib/api-server";
import { listMarkets, type MarketFilters as Filters } from "@/lib/services";
import { getRequestTenant } from "@/lib/tenant-server";
import type { MarketCategory } from "@/lib/types";
import { MarketsExplorer } from "@/components/markets/markets-explorer";

export const metadata: Metadata = { title: "Markets" };

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tenant = await getRequestTenant();
  const filters: Filters = {
    category: (typeof params.category === "string" ? params.category : "all") as
      | MarketCategory
      | "all",
    query: typeof params.q === "string" ? params.q : "",
    sort: (typeof params.sort === "string" ? params.sort : "volume") as Filters["sort"],
  };

  const remote = await fetchBackendMarkets(tenant.slug, filters);
  const internalMarkets = remote?.markets ?? listMarkets(filters);

  return <MarketsExplorer internalMarkets={internalMarkets} />;
}
