import { NextRequest, NextResponse } from "next/server";
import { hydrateTenantPortfolio, persistTenantPortfolio } from "@/lib/portfolio-persistence";
import { addJournalNote, getJournal } from "@/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  await hydrateTenantPortfolio(tenant.id);
  return NextResponse.json({ journal: getJournal(tenant.id) });
}

export async function POST(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  await hydrateTenantPortfolio(tenant.id);

  let body: { note?: string; tags?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.note?.trim()) {
    return NextResponse.json({ error: "note is required" }, { status: 400 });
  }

  const entry = addJournalNote(tenant.id, body.note.trim(), body.tags ?? []);
  await persistTenantPortfolio(tenant.id);
  return NextResponse.json({ entry }, { status: 201 });
}
