import type { ReactNode } from "react";
import { fetchBackendLiveEvents } from "@/lib/api-server";
import { initialPricesFromEvents, listFallbackLiveEvents } from "@/lib/live-events";
import { LivePricesProvider } from "@/lib/live-prices";
import { getRequestTenant } from "@/lib/tenant-server";
import { getAccount } from "@/lib/services";
import { AppShell } from "@/components/layout/app-shell";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const tenant = await getRequestTenant();
  const account = getAccount(tenant.id);

  const remote = await fetchBackendLiveEvents(tenant.slug);
  const liveEventsPayload = remote ?? listFallbackLiveEvents();
  const initialEvents = liveEventsPayload.events;
  const initialPrices = initialPricesFromEvents(initialEvents);

  return (
    <LivePricesProvider
      initialPrices={initialPrices}
      initialEvents={initialEvents}
      tenantSlug={tenant.slug}
    >
      <AppShell tenant={tenant} account={account}>
        {children}
      </AppShell>
    </LivePricesProvider>
  );
}
