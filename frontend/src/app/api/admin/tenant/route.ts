import { NextRequest, NextResponse } from "next/server";
import { getEffectiveTenant, updateTenantSettings } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";
import type { TenantOverrides } from "@/lib/store";

/**
 * Firm admin settings endpoint. In production this maps to the FastAPI
 * `PATCH /api/v1/tenants/current` route and requires a PropFirmAdmin JWT;
 * the demo applies changes to the in-memory store directly.
 */

export function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  return NextResponse.json({ tenant: getEffectiveTenant(tenant.id) });
}

// ~1.5MB guard for uploaded logo data URLs.
const MAX_LOGO_LENGTH = 2_000_000;

export async function PATCH(request: NextRequest) {
  const tenant = getTenantFromRequest(request);

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

  const updated = updateTenantSettings(tenant.id, body);
  return NextResponse.json({ tenant: updated });
}
