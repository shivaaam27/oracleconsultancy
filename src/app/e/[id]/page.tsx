import { notFound } from "next/navigation";
import { CalendarClock, MapPin, Video, Building2 } from "lucide-react";
import { getCalendarEvent, toIcsEvent } from "@/lib/calendar";
import { googleCalendarUrl } from "@/lib/ics";
import { sb } from "@/db/supabase";
import { ShareActions } from "./share-actions";

export const dynamic = "force-dynamic";

const EAT = "Africa/Dar_es_Salaam";

function fmtWhen(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay)
    return d.toLocaleDateString("en-GB", { timeZone: EAT, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return d.toLocaleString("en-GB", {
    timeZone: EAT, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Public, shareable event page. Anyone with the link can view the event and add
// it to their own calendar (Google / Apple / Outlook). No admin data exposed
// beyond the event itself — attendee emails are deliberately not shown.
export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numeric = parseInt(id, 10);
  if (!Number.isFinite(numeric)) notFound();

  const ev = await getCalendarEvent(numeric);
  if (!ev || ev.status === "cancelled") notFound();

  let companyName: string | null = null;
  if (ev.companyId) {
    const { data } = await sb.from("companies").select("name").eq("id", ev.companyId).maybeSingle();
    companyName = (data?.name as string) ?? null;
  }

  const googleUrl = googleCalendarUrl(toIcsEvent(ev));
  const icsPath = `/api/calendar/${ev.id}.ics`;
  const endWhen = ev.endAt && !ev.allDay
    ? new Date(ev.endAt).toLocaleTimeString("en-GB", { timeZone: EAT, hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <main className="min-h-dvh flex items-center justify-center p-5 bg-bg">
      <div className="w-full max-w-md glass elevated rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">You&rsquo;re invited</p>
          <h1 className="text-xl font-semibold leading-snug">{ev.title}</h1>
        </div>

        <div className="space-y-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <CalendarClock size={16} className="mt-0.5 text-fg-muted shrink-0" />
            <span>{fmtWhen(ev.startAt, ev.allDay)}{endWhen ? ` – ${endWhen}` : ""}</span>
          </div>
          {companyName && (
            <div className="flex items-center gap-2.5">
              <Building2 size={16} className="text-fg-muted shrink-0" />
              <span>{companyName}</span>
            </div>
          )}
          {ev.meetLink && (
            <div className="flex items-center gap-2.5">
              <Video size={16} className="text-fg-muted shrink-0" />
              <span className="text-accent break-all">{ev.meetLink}</span>
            </div>
          )}
          {ev.location && (
            <div className="flex items-start gap-2.5">
              <MapPin size={16} className="mt-0.5 text-fg-muted shrink-0" />
              <span>{ev.location}</span>
            </div>
          )}
        </div>

        {ev.description && (
          <p className="text-sm text-fg-muted whitespace-pre-wrap border-t border-border pt-4">{ev.description}</p>
        )}

        <div className="border-t border-border pt-4">
          <ShareActions googleUrl={googleUrl} icsPath={icsPath} meetLink={ev.meetLink} />
        </div>

        <p className="text-[11px] text-fg-subtle text-center pt-1">Times shown in Dar es Salaam (UTC+3).</p>
      </div>
    </main>
  );
}
