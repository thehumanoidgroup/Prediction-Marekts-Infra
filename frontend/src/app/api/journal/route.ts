import { NextRequest, NextResponse } from "next/server";
import { fetchBackendJournal, postBackendJournalNote } from "@/lib/api-server";
import { addJournalNote, getJournal } from "@/lib/services";
import { getTenantFromRequest } from "@/lib/tenant-request";

export async function GET(request: NextRequest) {
  const tenant = getTenantFromRequest(request);
  const remote = await fetchBackendJournal(tenant.slug);
  if (remote) return NextResponse.json(remote);
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

  const remote = await postBackendJournalNote(tenant.slug, note, safeTags);
  if (remote) return NextResponse.json(remote, { status: 201 });

  const entry = addJournalNote(tenant.id, note, safeTags);
  return NextResponse.json({ entry }, { status: 201 });
}
