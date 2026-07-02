import { headers } from "next/headers";
import { getTenant, type TenantConfig } from "@/lib/tenants";

const TENANT_HEADER = "x-tenant-id";

/** Reads the tenant resolved by the middleware for the current request. */
export async function getRequestTenant(): Promise<TenantConfig> {
  const headerList = await headers();
  return getTenant(headerList.get(TENANT_HEADER));
}
