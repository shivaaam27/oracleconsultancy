import { NextResponse } from "next/server";
import { getCalendarEventByToken, toIcsEvent } from "@/lib/calendar";
import { buildIcs } from "@/lib/ics";

// Serves a single event as a downloadable .ics file. Linking to or attaching
// this URL lets any calendar app (Google/Apple/Outlook) save the event
// automatically. `id` is the event's public share TOKEN (its random uid prefix),
// optionally with a `.ics` suffix — not the guessable sequential database id.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = id.replace(/\.ics$/i, "");

  const ev = await getCalendarEventByToken(token);
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
