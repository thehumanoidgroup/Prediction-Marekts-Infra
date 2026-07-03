import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getRequestTenant } from "@/lib/tenant-server";
import { Badge } from "@/components/ui/badge";
import { PlatformTabs } from "@/components/platform/platform-tabs";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  return { title: `Platform Admin · ${tenant.name}` };
}

/**
 * Platform owner area. In production this layout is gated to the
 * SuperAdmin role via the backend JWT; the demo leaves it open.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const tenant = await getRequestTenant();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Platform admin</h1>
            <Badge tone="accent">SuperAdmin</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {tenant.name} · system-wide operations
          </p>
        </div>
      </div>
      <PlatformTabs />
      {children}
    </div>
  );
}
