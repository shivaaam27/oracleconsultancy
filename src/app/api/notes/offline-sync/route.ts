import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";
import { textToDoc, titleFromText, isIsoDate, MAX_TEXT, MAX_TITLE } from "@/lib/offline-notes-shared";

/* ------------------------------------------------------------------ *
 * Notes written offline, arriving.
 *
 * The device holds a note until it can be sent, then posts the lot here. Each
 * carries a key the DEVICE chose, and `notes.client_key` has a unique index, so
 * sending the same note twice is not an error — it is a no-op. That is the whole
 * trick: the connection can drop after the insert but before the reply, the
 * device can retry as often as it likes, and there is still one note.
 *
 * ⚠️ Owner-only, and checked HERE as well as at the edge. Notes are owner-only by
 * design — no staff, no portal twin — and this route creates them. It is inside
 * the admin gate (`api/notes` is NOT in the proxy's exclusion list), and the
 * check below is the second lock, because one day somebody will edit that list.
 *
 * ⚠️ It reports exactly which keys are now stored, and the device deletes only
 * those. Anything not named in the reply stays on the device and is offered
 * again — a note is never dropped on the assumption it got through.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

const MAX_DRAFTS = 50;

type Incoming = { clientKey?: unknown; title?: unknown; text?: unknown; createdAt?: unknown };

export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload: { drafts?: Incoming[] };
  try {
    payload = (await req.json()) as { drafts?: Incoming[] };
  } catch {
    return NextResponse.json({ error: "Unreadable request." }, { status: 400 });
  }

  const drafts = Array.isArray(payload.drafts) ? payload.drafts.slice(0, MAX_DRAFTS) : [];
  if (drafts.length === 0) return NextResponse.json({ saved: [] });

  const saved: string[] = [];

  for (const d of drafts) {
    const clientKey = typeof d.clientKey === "string" ? d.clientKey.slice(0, 100) : "";
    const text = typeof d.text === "string" ? d.text.slice(0, MAX_TEXT) : "";
    if (!clientKey) continue;
    // An empty note is not worth a row, but the device should still stop
    // offering it — so it counts as saved.
    if (!text.trim()) {
      saved.push(clientKey);
      continue;
    }

    const title =
      typeof d.title === "string" && d.title.trim() ? d.title.trim().slice(0, MAX_TITLE) : titleFromText(text);
    // Trust the device's clock for WHEN IT WAS WRITTEN — that is the useful fact,
    // and it is the only clock that was there. A nonsense value falls back to now.
    const createdAt = isIsoDate(d.createdAt) ? new Date(d.createdAt).toISOString() : new Date().toISOString();

    const { error } = await sb.from("notes").insert({
      title,
      body_json: textToDoc(text),
      body_text: text,
      created_by: "offline",
      client_key: clientKey,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    });

    if (!error) {
      saved.push(clientKey);
      continue;
    }

    // 23505 = unique violation: this note is already here from an earlier
    // attempt whose reply never arrived. Exactly the case the key exists for,
    // so it counts as saved and the device can let it go.
    if (error.code === "23505") {
      saved.push(clientKey);
      continue;
    }

    // Anything else: leave it on the device and try again later. Do not report
    // it as saved — that is how writing gets lost.
  }

  return NextResponse.json({ saved });
}
