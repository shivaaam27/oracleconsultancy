import { NextResponse } from "next/server";
import { getCalendarEvent, toIcsEvent } from "@/lib/calendar";
import { buildIcs } from "@/lib/ics";

// Serves a single event as a downloadable .ics file. Linking to or attaching
// this URL lets any calendar app (Google/Apple/Outlook) save the event
// automatically. `id` may be the numeric id, optionally with a `.ics` suffix.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numeric = parseInt(id.replace(/\.ics$/i, ""), 10);
  if (!Number.isFinite(numeric)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const ev = await getCalendarEvent(numeric);
  if (!ev) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ics = buildIcs(toIcsEvent(ev));
  const safeName = ev.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "event";

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=REQUEST",
      "Content-Disposition": `attachment; filename="${safeName}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
