import type { NextRequest } from "next/server";
import { getTenant, getTenantBySlug, type TenantConfig } from "@/lib/tenants";

const TENANT_ID_HEADER = "x-tenant-id";
const TENANT_SLUG_HEADER = "x-tenant-slug";

/** Resolves the tenant for an API route from middleware headers. */
export function getTenantFromRequest(request: NextRequest): TenantConfig {
  const slug = request.headers.get(TENANT_SLUG_HEADER);
  if (slug) {
    const bySlug = getTenantBySlug(slug);
    if (bySlug) return bySlug;
  }
  return getTenant(request.headers.get(TENANT_ID_HEADER) ?? request.cookies.get("pp-tenant")?.value);
}

/** Backend slug for BFF proxy calls. */
export function getTenantSlugFromRequest(request: NextRequest): string {
  return (
    request.headers.get(TENANT_SLUG_HEADER) ??
    getTenantFromRequest(request).slug
  );
}
