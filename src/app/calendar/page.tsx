import { listCalendarEvents, toIcsEvent } from "@/lib/calendar";
import { countEventDocuments } from "@/lib/event-documents";
import { advanceDueMeetingTasks, postMeetingFollowups } from "@/lib/meeting-tasks";
import { listOverlayItems } from "@/lib/calendar-overlays";
import { listEventCategories } from "@/lib/event-categories";
import { googleCalendarUrl } from "@/lib/ics";
import { sb } from "@/db/supabase";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { listAnnouncements, receiptStats, isLive, isScheduled } from "@/lib/announcements";
import { CalendarBoard, type CalendarEventView, type BriefAnnouncement } from "./calendar-board";

export const dynamic = "force-dynamic";

const EAT = "Africa/Dar_es_Salaam";
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: EAT });
}
function shiftKey(days: number): string {
  return dayKey(new Date(Date.now() + days * 24 * 3600_000).toISOString());
}

export default async function CalendarPage() {
  // The owner, or a director — who reads the events of their companies and
  // the ones they are invited to (lib/viewer.ts).
  const viewer = await getViewer();
  if (!viewer) redirect("/portal");
  const director = viewer.kind === "director" ? viewer : null;
  // Opportunistic: advance meetings whose start has passed to In Progress, and
  // prompt for the outcome on meetings that have ended (throttled, best-effort).
  // The owner's visit only — a director's look must not move anything.
  if (!director) {
    void advanceDueMeetingTasks().catch(() => {});
    void postMeetingFollowups().catch(() => {});
  }

  // Overlay window: ~1 month back to ~13 months ahead, so paging the calendar
  // rarely needs a refetch.
  const overlayFrom = shiftKey(-31);
  const overlayTo = shiftKey(400);

  const [eventsAll, overlaysAll, categories, announcementsRaw, { data: peopleRaw }, { data: companiesRaw }] = await Promise.all([
    listCalendarEvents(),
    listOverlayItems(overlayFrom, overlayTo),
    listEventCategories(),
    director ? Promise.resolve([] as Awaited<ReturnType<typeof listAnnouncements>>) : listAnnouncements(),
    sb.from("people").select("id,name,email").eq("active", true).order("name"),
    sb.from("companies").select("id,name,accent_color").order("name"),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  // A director: their companies' events and any they are invited to; of the
  // overlays, their companies' task deadlines and renewals, and holidays —
  // not staff leave, birthdays or probation (HR's), nor the owner's notices.
  const scope = viewer.scope;
  const inScope = (cid: number | null | undefined) => scope == null || (cid != null && scope.includes(cid));
  const events = director
    ? eventsAll.filter((e) => inScope(e.companyId) || e.attendees.some((a) => a.personId === director.person.id))
    : eventsAll;
  const overlays = director
    ? overlaysAll.filter((o) => o.kind === "holiday" || ((o.kind === "task" || o.kind === "renewal") && inScope(o.companyId)))
    : overlaysAll;

  // Announcements with live receipt stats (seen / ack / audience total) for the
  // Announcements tab + the "haven't acknowledged" KPI.
  const announcements: BriefAnnouncement[] = await Promise.all(
    announcementsRaw.map(async (a) => ({
      ...a,
      live: isLive(a),
      scheduled: isScheduled(a),
      stats: a.status === "published" ? await receiptStats(a) : { seen: 0, ack: 0, total: 0 },
    })),
  );
  const unacknowledged = announcements
    .filter((a) => a.live && a.requireAck)
    .reduce((n, a) => n + Math.max(0, a.stats.total - a.stats.ack), 0);

  // The guest picker's list (names + emails) is for adding people — a
  // director adds nobody, so it is not sent.
  const people = (director ? [] : peopleRaw ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    email: (p.email as string) ?? null,
  }));
  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accent: (c.accent_color as string) ?? null,
  }));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const companyAccent = new Map(companies.map((c) => [c.id, c.accent]));

  // Pre-compute the share links server-side (the Google URL builder lives next to
  // the .ics builder; keeping it here avoids duplicating the mapping client-side).
  // How many papers each entry carries — ONE query for the whole board, so a
  // flight with its ticket attached is obvious without opening it.
  const attachmentCounts = await countEventDocuments(events.map((e) => e.id));

  const views: CalendarEventView[] = events.map((ev) => ({
    ...ev,
    companyLabel: ev.companyId ? companyName.get(ev.companyId) ?? null : null,
    companyAccent: ev.companyId ? companyAccent.get(ev.companyId) ?? null : null,
    categoryName: ev.categoryId ? categoryName.get(ev.categoryId) ?? null : null,
    googleUrl: googleCalendarUrl(toIcsEvent(ev)),
    icsPath: `/api/calendar/${ev.publicToken}.ics`,
    attachmentCount: attachmentCounts.get(ev.id) ?? 0,
  }));

  const now = Date.now();
  const todayKey = dayKey(new Date().toISOString());
  const weekEnd = now + 7 * 24 * 3600_000;
  const today = views.filter((e) => dayKey(e.startAt) === todayKey).length;
  const thisWeek = views.filter((e) => {
    const t = new Date(e.startAt).getTime();
    return t >= now && t < weekEnd;
  }).length;
  // Upcoming events with email attendees but no Google event yet — a proxy for
  // "invite not sent" (sendEventInviteAction mints the Google event). Powers the
  // "need invites" intelligence chip + per-event badge.
  const needInvites = views.filter(
    (e) => new Date(e.startAt).getTime() >= now && !e.googleEventId && e.attendees.some((a) => a.email),
  ).length;

  const counts = { thisWeek, today, needInvites, unacknowledged };

  return (
    <div className="w-full">
      <CalendarBoard
        events={views}
        overlays={overlays}
        people={people}
        companies={companies}
        categories={categories}
        announcements={announcements}
        readOnly={!!director}
        counts={counts}

      />
    </div>
  );
}
