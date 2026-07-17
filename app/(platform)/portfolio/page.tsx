import type { Metadata } from "next";
import { getRequestTenant } from "@/lib/tenant-server";
import { getAccount, getPortfolioSummary, getPositions } from "@/lib/services";
import { PortfolioClient } from "@/components/dashboard/portfolio-client";

export const metadata: Metadata = { title: "My Portfolio" };

export default async function PortfolioPage() {
  const tenant = await getRequestTenant();
  const initial = {
    account: getAccount(tenant.id),
    summary: getPortfolioSummary(tenant.id),
    positions: getPositions(tenant.id),
  };

  return <PortfolioClient initial={initial} />;
}
