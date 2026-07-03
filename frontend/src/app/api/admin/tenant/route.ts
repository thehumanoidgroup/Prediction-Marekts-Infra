import { NextRequest, NextResponse } from "next/server";
import { patchTenantConfig, fetchTenantConfig } from "@/lib/tenant-api";
import { getEffectiveTenant, updateTenantSettings } from "@/lib/services";
import { getTenantFromRequest, getTenantSlugFromRequest } from "@/lib/tenant-request";
import type { TenantOverrides } from "@/lib/store";

/**
 * Firm admin settings endpoint — persists to Postgres via FastAPI when
 * available, otherwise applies to the in-memory demo store.
 */

export async function GET(request: NextRequest) {
  const slug = getTenantSlugFromRequest(request);
  const remote = await fetchTenantConfig(slug);
  if (remote) return NextResponse.json({ tenant: remote });

  const tenant = getTenantFromRequest(request);
  return NextResponse.json({ tenant: getEffectiveTenant(tenant.id) });
}

const MAX_LOGO_LENGTH = 2_000_000;

export async function PATCH(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  const slug = getTenantSlugFromRequest(request);

  let body: TenantOverrides;
  try {
    body = (await request.json()) as TenantOverrides;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }
  const logoUrl = body.branding?.logoUrl;
  if (logoUrl !== undefined && logoUrl !== "") {
    if (typeof logoUrl !== "string" || !logoUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "Logo must be an image" }, { status: 400 });
    }
    if (logoUrl.length > MAX_LOGO_LENGTH) {
      return NextResponse.json({ error: "Logo must be under ~1.5MB" }, { status: 400 });
    }
  }

  const remote = await patchTenantConfig(slug, body);
  if (remote) return NextResponse.json({ tenant: remote });

  const updated = updateTenantSettings(tenant.id, body);
  return NextResponse.json({ tenant: updated });
}
