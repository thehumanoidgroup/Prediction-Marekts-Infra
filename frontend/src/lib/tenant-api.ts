import type { TenantConfig } from "@/lib/tenants";
import { getBackendUrl } from "@/lib/backend";
import type { TenantOverrides } from "@/lib/store";

/** Fetch white-label tenant config from the FastAPI database. */
export async function fetchTenantConfig(tenantSlug: string): Promise<TenantConfig | null> {
  const base = getBackendUrl();
  if (!base) return null;

  try {
    const response = await fetch(`${base}/api/v1/tenants/current`, {
      headers: { "X-Tenant-Slug": tenantSlug },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as TenantConfig;
  } catch (error) {
    console.error("[backend] tenant config:", error);
    return null;
  }
}

/** Persist branding / program changes to the database. */
export async function patchTenantConfig(
  tenantSlug: string,
  patch: TenantOverrides,
): Promise<TenantConfig | null> {
  const base = getBackendUrl();
  if (!base) return null;

  try {
    const response = await fetch(`${base}/api/v1/tenants/current`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": tenantSlug,
      },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        typeof err.detail === "string"
          ? err.detail
          : `Backend error ${response.status}`,
      );
    }
    return (await response.json()) as TenantConfig;
  } catch (error) {
    console.error("[backend] tenant patch:", error);
    return null;
  }
}
