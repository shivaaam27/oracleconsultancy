/**
 * Calendar for a member of STAFF, in Studio (26 Sept 2026). The owner's own
 * Calendar board, read-only, holding what staff could already see on the old
 * Briefings page: the meetings they are INVITED to (never a cancelled one),
 * plus public holidays. No guest list to pick from, no task or HR overlays,
 * nothing to create — the board's `readOnly` switches every writer off, and the
 * one read it makes of the owner's actions (an event's papers) is skipped when
 * read-only.
 */
import type { PortalPerson } from "@/lib/portal-auth";
import { sb } from "@/db/supabase";
import { listCalendarEvents, toIcsEvent } from "@/lib/calendar";
import { listOverlayItems } from "@/lib/calendar-overlays";
import { listEventCategories } from "@/lib/event-categories";
import { googleCalendarUrl } from "@/lib/ics";
import { CalendarBoard, type CalendarEventView } from "@/app/calendar/calendar-board";

const EAT = "Africa/Dar_es_Salaam";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: EAT });
const shiftKey = (days: number) => dayKey(new Date(Date.now() + days * 86_400_000).toISOString());

export async function StaffCalendar({ me }: { me: PortalPerson }) {
  const [eventsAll, overlaysAll, categories, { data: companiesRaw }] = await Promise.all([
    listCalendarEvents(),
    listOverlayItems(shiftKey(-31), shiftKey(400)),
    listEventCategories(),
    sb.from("companies").select("id,name,accent_color").order("name"),
  ]);
  const events = eventsAll.filter((e) => (e.status ?? "confirmed") !== "cancelled" && e.attendees.some((a) => a.personId === me.id));
  const overlays = overlaysAll.filter((o) => o.kind === "holiday");
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string, accent: (c.accent_color as string | null) ?? null }));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const companyAccent = new Map(companies.map((c) => [c.id, c.accent]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const views: CalendarEventView[] = events.map((ev) => ({
    ...ev,
    companyLabel: ev.companyId ? companyName.get(ev.companyId) ?? null : null,
    companyAccent: ev.companyId ? companyAccent.get(ev.companyId) ?? null : null,
    categoryName: ev.categoryId ? categoryName.get(ev.categoryId) ?? null : null,
    googleUrl: googleCalendarUrl(toIcsEvent(ev)),
    icsPath: `/api/calendar/${ev.publicToken}.ics`,
    attachmentCount: 0,
  }));

  const now = Date.now();
  const todayKey = dayKey(new Date().toISOString());
  const counts = {
    today: views.filter((e) => dayKey(e.startAt) === todayKey).length,
    thisWeek: views.filter((e) => { const t = new Date(e.startAt).getTime(); return t >= now && t < now + 7 * 86_400_000; }).length,
    needInvites: 0,
    unacknowledged: 0,
  };
  // Only the companies their meetings are in, so the filter offers nothing else.
  const used = new Set(views.map((v) => v.companyId).filter((x): x is number => x != null));

  return (
    <div className="w-full">
      <CalendarBoard
        events={views}
        overlays={overlays}
        people={[]}
        companies={companies.filter((c) => used.has(c.id))}
        categories={categories}
        announcements={[]}
        readOnly
        counts={counts}
      />
    </div>
  );
}
