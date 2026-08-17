// /api/notes/linked — which notes mention this record (Phase 3 of the notes plan).
//
// GET ?type=task|person|company|document|note&id=<n>  → { notes: LinkedNote[] }
//
// Exists for the ONE record screen that is drawn on the client: the task record
// (`task-drawer.tsx`) loads itself from an API and has nowhere to put a server
// read. Company and person pages are server components and call `notesLinkedTo()`
// directly — no round trip.
//
// ⚠️ OWNER-ONLY. Notes never reach the staff portal (§8 of the plan), so this
// route MUST stay inside the admin gate in `src/proxy.ts`. Adding it to the
// exclusion list would hand every member of staff the contents of the owner's
// notes about them, which is the exact thing the module is built not to do.

import { NextRequest, NextResponse } from "next/server";
import { notesLinkedTo } from "@/lib/note-links";
import { isLinkType } from "@/lib/note-links-shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const id = Number(url.searchParams.get("id"));
    if (!isLinkType(type) || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ notes: [] });
    }
    return NextResponse.json({ notes: await notesLinkedTo(type, id) });
  } catch {
    return NextResponse.json({ notes: [] });
  }
}
