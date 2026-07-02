import type { NextRequest } from "next/server";
import { getTenant, type TenantConfig } from "@/lib/tenants";

/** Resolves the tenant for an API route from the middleware header. */
export function getTenantFromRequest(request: NextRequest): TenantConfig {
  return getTenant(
    request.headers.get("x-tenant-id") ?? request.cookies.get("pp-tenant")?.value,
  );
}
