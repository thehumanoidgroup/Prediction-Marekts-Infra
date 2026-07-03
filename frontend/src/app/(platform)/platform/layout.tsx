import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { PlatformTabs } from "@/components/platform/platform-tabs";

export const metadata: Metadata = { title: "Platform Admin" };

/**
 * Platform owner area. In production this layout is gated to the
 * SuperAdmin role via the backend JWT; the demo leaves it open.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Platform admin</h1>
            <Badge tone="accent">SuperAdmin</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">PropPredict · system-wide operations</p>
        </div>
      </div>
      <PlatformTabs />
      {children}
    </div>
  );
}
