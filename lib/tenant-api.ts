import type { TenantConfig } from "@/lib/tenants";
import type { TenantOverrides } from "@/lib/store";
import { ensureSeeded } from "@/lib/seed";
import { getTenantConfigBySlug, patchTenantBySlug } from "@/lib/tenant-db";

/** Fetch white-label tenant config from the database. */
export async function fetchTenantConfig(tenantSlug: string): Promise<TenantConfig | null> {
  if (!process.env.DATABASE_URL) return null;
  await ensureSeeded();
  return getTenantConfigBySlug(tenantSlug);
}

/** Persist branding / program changes to the database. */
export async function patchTenantConfig(
  tenantSlug: string,
  patch: TenantOverrides,
): Promise<TenantConfig | null> {
  if (!process.env.DATABASE_URL) return null;
  await ensureSeeded();
  return patchTenantBySlug(tenantSlug, patch);
}
