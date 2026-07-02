import { NextRequest, NextResponse } from "next/server";
import { addJournalNote, getJournal } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  return NextResponse.json({ journal: getJournal(tenant.id) });
}

export async function POST(request: NextRequest) {
  const tenant = getTenantFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { note, tags } = (body ?? {}) as Record<string, unknown>;
  if (typeof note !== "string" || !note.trim()) {
    return NextResponse.json({ error: "Expected { note: string, tags?: string[] }" }, { status: 400 });
  }
  const safeTags = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];

  const entry = addJournalNote(tenant.id, note, safeTags);
  return NextResponse.json({ entry }, { status: 201 });
}
