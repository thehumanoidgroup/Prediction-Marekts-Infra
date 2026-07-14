import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_TENANT_ID, getTenant, getTenantBySlug } from "@/lib/tenants";

export const TENANT_HEADER = "x-tenant-id";
export const TENANT_SLUG_HEADER = "x-tenant-slug";
export const TENANT_COOKIE = "pp-tenant";

/**
 * Resolves the active tenant for every request, in priority order:
 *  1. `?tenant=<id>` query param (demo/dev switching — persisted to a cookie)
 *  2. Subdomain (`apex.proppredict.com` → tenant with slug `apex`)
 *  3. `pp-tenant` cookie
 *  4. Default tenant
 *
 * Forwards both client id and backend slug headers for downstream resolution.
 */
export function middleware(request: NextRequest) {
  const queryTenant = request.nextUrl.searchParams.get("tenant");
  const host = request.headers.get("host") ?? "";
  const subdomain = host.split(":")[0].split(".")[0];
  const cookieTenant = request.cookies.get(TENANT_COOKIE)?.value;

  const resolvedId =
    (queryTenant && getTenant(queryTenant).id === queryTenant && queryTenant) ||
    getTenantBySlug(subdomain)?.id ||
    (cookieTenant && getTenant(cookieTenant).id === cookieTenant && cookieTenant) ||
    DEFAULT_TENANT_ID;

  const tenant = getTenant(resolvedId);
  const headers = new Headers(request.headers);
  headers.set(TENANT_HEADER, resolvedId);
  headers.set(TENANT_SLUG_HEADER, tenant.slug);

  const response = NextResponse.next({ request: { headers } });
  if (resolvedId !== cookieTenant) {
    response.cookies.set(TENANT_COOKIE, resolvedId, {
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
