import type { ReactNode } from "react";
import { getRequestTenant } from "@/lib/tenant-server";
import { getAccount, listMarkets } from "@/lib/services";
import { LivePricesProvider } from "@/lib/live-prices";
import { AppShell } from "@/components/layout/app-shell";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const tenant = await getRequestTenant();
  const account = getAccount(tenant.id);
  const initialPrices = Object.fromEntries(listMarkets().map((m) => [m.id, m.yesPrice]));

  return (
    <LivePricesProvider initialPrices={initialPrices} tenantSlug={tenant.slug}>
      <AppShell tenant={tenant} account={account}>
        {children}
      </AppShell>
    </LivePricesProvider>
  );
}
