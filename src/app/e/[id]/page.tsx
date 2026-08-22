import { notFound } from "next/navigation";
import { CalendarClock, MapPin, Video, Building2, Paperclip, Download } from "lucide-react";
import { getCalendarEventByToken, toIcsEvent } from "@/lib/calendar";
import { eventAttachmentLinks } from "@/lib/event-documents";
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
  // `id` is the event's public share token (its random uid prefix), not the
  // sequential database id — so the link can't be guessed by counting numbers.
  const ev = await getCalendarEventByToken(id);
  if (!ev || ev.status === "cancelled") notFound();

  let companyName: string | null = null;
  if (ev.companyId) {
    const { data } = await sb.from("companies").select("name").eq("id", ev.companyId).maybeSingle();
    companyName = (data?.name as string) ?? null;
  }

  // Only papers marked "share with guests" — a reference-only attachment is
  // never listed here, and the /doc route enforces the same rule.
  const attachments = await eventAttachmentLinks(ev.id, ev.publicToken).catch(() => []);

  const googleUrl = googleCalendarUrl(toIcsEvent(ev));
  const icsPath = `/api/calendar/${ev.publicToken}.ics`;
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

        {/* The papers. This is the link that has to keep working months later —
            it is served by /e/<token>/doc/<id>, which mints a fresh storage URL
            on each visit, so nothing here expires the way a signed URL would. */}
        {attachments.length > 0 && (
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {attachments.length === 1 ? "Attached" : "Attached files"}
            </p>
            {attachments.map((a) => (
              <a
                key={a.documentId}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 rounded-xl bg-bg-subtle px-3 py-2.5 ring-1 ring-border transition-colors hover:bg-bg-muted"
              >
                <Paperclip size={15} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-sm">{a.fileName || a.title}</span>
                <Download size={14} className="shrink-0 text-fg-subtle" />
              </a>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-4">
          <ShareActions googleUrl={googleUrl} icsPath={icsPath} meetLink={ev.meetLink} />
        </div>

        <p className="text-xs text-fg-subtle text-center pt-1">Times shown in Dar es Salaam (UTC+3).</p>
      </div>
    </main>
  );
}
