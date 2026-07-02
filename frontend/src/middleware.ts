import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_TENANT_ID, getTenant, getTenantBySlug } from "@/lib/tenants";

export const TENANT_HEADER = "x-tenant-id";
export const TENANT_COOKIE = "pp-tenant";

/**
 * Resolves the active tenant for every request, in priority order:
 *  1. `?tenant=<id>` query param (demo/dev switching — persisted to a cookie)
 *  2. Subdomain (`apex.proppredict.com` → tenant with slug `apex`)
 *  3. `pp-tenant` cookie
 *  4. Default tenant
 *
 * The resolved id is forwarded via a request header so server components
 * and API routes can read it without re-deriving it.
 */
export function middleware(request: NextRequest) {
  const queryTenant = request.nextUrl.searchParams.get("tenant");
  const host = request.headers.get("host") ?? "";
  const subdomain = host.split(":")[0].split(".")[0];
  const cookieTenant = request.cookies.get(TENANT_COOKIE)?.value;

  const resolved =
    (queryTenant && getTenant(queryTenant).id === queryTenant && queryTenant) ||
    getTenantBySlug(subdomain)?.id ||
    (cookieTenant && getTenant(cookieTenant).id === cookieTenant && cookieTenant) ||
    DEFAULT_TENANT_ID;

  const headers = new Headers(request.headers);
  headers.set(TENANT_HEADER, resolved);

  const response = NextResponse.next({ request: { headers } });
  if (resolved !== cookieTenant) {
    response.cookies.set(TENANT_COOKIE, resolved, {
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
