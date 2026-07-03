import { headers } from "next/headers";
import { cache } from "react";
import { fetchTenantConfig } from "@/lib/tenant-api";
import { DEFAULT_TENANT_ID, getTenant, getTenantBySlug, type TenantConfig } from "@/lib/tenants";
import { getEffectiveTenant } from "@/lib/services";

export const TENANT_ID_HEADER = "x-tenant-id";
export const TENANT_SLUG_HEADER = "x-tenant-slug";

/** Resolved subdomain slug for the current request (backend lookup key). */
export const getRequestSlug = cache(async (): Promise<string> => {
  const headerList = await headers();
  const slugHeader = headerList.get(TENANT_SLUG_HEADER);
  if (slugHeader) return slugHeader;

  const clientId = headerList.get(TENANT_ID_HEADER);
  if (clientId) return getTenant(clientId).slug;

  return getTenant(DEFAULT_TENANT_ID).slug;
});

/**
 * Loads tenant white-label config from the database when the backend is
 * available, otherwise falls back to the static registry + local overrides.
 */
export const getRequestTenant = cache(async (): Promise<TenantConfig> => {
  const slug = await getRequestSlug();
  const remote = await fetchTenantConfig(slug);
  if (remote) return remote;

  const headerList = await headers();
  const clientId = headerList.get(TENANT_ID_HEADER);
  const fallback =
    (clientId && getTenant(clientId).id === clientId && getEffectiveTenant(clientId)) ||
    getTenantBySlug(slug) ||
    getEffectiveTenant(DEFAULT_TENANT_ID);

  return fallback;
});
