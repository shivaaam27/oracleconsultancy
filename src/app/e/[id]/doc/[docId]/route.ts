// The permanent link to a paper attached to an event.
//
// Why this exists rather than a Supabase signed URL: a signed URL expires (ours
// last five minutes). A calendar entry does not. The director opens the flight
// on his phone the night before travelling, weeks after the invitation was sent,
// and the "View ticket" link has to still work — so the .ics, the email and the
// public event page all point HERE, and this route mints the short-lived storage
// URL fresh on each visit.
//
// Authorisation is the event's own share token, exactly as /e/<token> is: the
// token is unguessable, and anyone holding it is already looking at the event.
// A document must additionally be marked "share with guests" (send_with_invite)
// — un-ticking that box withdraws it from the email AND from this link at once.

import { NextResponse } from "next/server";
import { getCalendarEventByToken } from "@/lib/calendar";
import { getEventDocument } from "@/lib/event-documents";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params;

  const ev = await getCalendarEventByToken(id);
  if (!ev || ev.status === "cancelled") {
    return new NextResponse("Not found", { status: 404 });
  }

  const documentId = Number(docId);
  if (!Number.isFinite(documentId)) return new NextResponse("Not found", { status: 404 });

  const doc = await getEventDocument(ev.id, documentId, { sharedOnly: true });
  if (!doc || !doc.storagePath) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).download(doc.storagePath);
  if (error || !data) return new NextResponse("The file could not be read.", { status: 404 });

  const bytes = Buffer.from(await data.arrayBuffer());
  const fileName = (doc.fileName || doc.title || "attachment").replace(/["\\]/g, "");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      // `inline` so a PDF or a photo opens in the phone's viewer rather than
      // landing in Downloads — the behaviour of an airline's own attachment.
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Content-Length": String(bytes.length),
      // Private: the token is a capability, so this must never sit in a shared
      // cache, but the recipient's own browser may keep it briefly.
      "Cache-Control": "private, max-age=300",
    },
  });
}
