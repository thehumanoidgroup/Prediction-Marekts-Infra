"use client";

import { useRouter } from "next/navigation";
import { IconChevronDown } from "@/components/ui/icons";

/**
 * Demo-only firm switcher. In production each firm lives on its own
 * subdomain; this control exercises the same middleware resolution path
 * via the `?tenant=` query param.
 */
export function TenantSwitcher({
  current,
  tenants,
}: {
  current: string;
  tenants: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Switch firm</span>
      <select
        value={current}
        onChange={(event) => {
          router.push(`/?tenant=${event.target.value}`);
          router.refresh();
        }}
        className="h-8 appearance-none rounded-lg border border-edge bg-surface-2 pl-3 pr-8 text-xs font-medium text-muted outline-none transition-colors hover:text-foreground focus:border-edge-strong"
      >
        {tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-2 text-sm text-faint" />
    </label>
  );
}
