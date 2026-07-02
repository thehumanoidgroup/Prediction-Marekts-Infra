import type { ReactNode } from "react";
import { getRequestTenant } from "@/lib/tenant-server";
import { getAccount } from "@/lib/services";
import { AppShell } from "@/components/layout/app-shell";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const tenant = await getRequestTenant();
  const account = getAccount(tenant.id);

  return (
    <AppShell tenant={tenant} account={account}>
      {children}
    </AppShell>
  );
}
