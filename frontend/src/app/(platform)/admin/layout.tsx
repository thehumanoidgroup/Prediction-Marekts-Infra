import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getRequestTenant } from "@/lib/tenant-server";
import { Badge } from "@/components/ui/badge";
import { AdminTabs } from "@/components/admin/admin-tabs";

export const metadata: Metadata = { title: "Firm Admin" };

/**
 * Firm admin area. In production this layout is gated to the
 * PropFirmAdmin role via the backend JWT; the demo leaves it open.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const tenant = await getRequestTenant();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Firm admin</h1>
            <Badge tone="accent">PropFirmAdmin</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {tenant.name} · {tenant.slug}.proppredict.com
          </p>
        </div>
      </div>
      <AdminTabs />
      {children}
    </div>
  );
}
