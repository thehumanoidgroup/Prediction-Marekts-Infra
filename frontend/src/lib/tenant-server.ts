import { headers } from "next/headers";
import { getTenant, type TenantConfig } from "@/lib/tenants";
import { getEffectiveTenant } from "@/lib/services";

const TENANT_HEADER = "x-tenant-id";

/**
 * Reads the tenant resolved by the middleware for the current request,
 * with the firm's admin-edited overrides (branding, program rules)
 * already merged in.
 */
export async function getRequestTenant(): Promise<TenantConfig> {
  const headerList = await headers();
  const base = getTenant(headerList.get(TENANT_HEADER));
  return getEffectiveTenant(base.id);
}
