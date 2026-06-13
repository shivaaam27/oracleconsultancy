import { Hero, TONE, type Tone } from "@/components/surface-kit";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { listCalendarEvents, toIcsEvent } from "@/lib/calendar";
import { listOverlayItems } from "@/lib/calendar-overlays";
import { googleCalendarUrl } from "@/lib/ics";
import { sb } from "@/db/supabase";
import { CalendarBoard, type CalendarEventView } from "./calendar-board";

export const dynamic = "force-dynamic";

const EAT = "Africa/Dar_es_Salaam";
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: EAT });
}
function shiftKey(days: number): string {
  return dayKey(new Date(Date.now() + days * 24 * 3600_000).toISOString());
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  // Overlay window: ~1 month back to ~13 months ahead, so paging the calendar
  // rarely needs a refetch.
  const overlayFrom = shiftKey(-31);
  const overlayTo = shiftKey(400);

  const [events, overlays, { data: peopleRaw }, { data: companiesRaw }] = await Promise.all([
    listCalendarEvents(),
    listOverlayItems(overlayFrom, overlayTo),
    sb.from("people").select("id,name,email").eq("active", true).order("name"),
    sb.from("companies").select("id,name,accent_color").order("name"),
  ]);

  const people = (peopleRaw ?? []).map((p) => ({
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
  const views: CalendarEventView[] = events.map((ev) => ({
    ...ev,
    companyLabel: ev.companyId ? companyName.get(ev.companyId) ?? null : null,
    companyAccent: ev.companyId ? companyAccent.get(ev.companyId) ?? null : null,
    googleUrl: googleCalendarUrl(toIcsEvent(ev)),
    icsPath: `/api/calendar/${ev.publicToken}.ics`,
  }));

  const now = Date.now();
  const todayKey = dayKey(new Date().toISOString());
  const weekEnd = now + 7 * 24 * 3600_000;
  const upcoming = views.filter((e) => new Date(e.startAt).getTime() >= now - 12 * 3600_000).length;
  const today = views.filter((e) => dayKey(e.startAt) === todayKey).length;
  const thisWeek = views.filter((e) => {
    const t = new Date(e.startAt).getTime();
    return t >= now && t < weekEnd;
  }).length;

  const metrics: { label: string; value: number; tone: Tone }[] = [
    { label: "This week", value: thisWeek, tone: "accent" },
    { label: "Today", value: today, tone: today ? "info" : "muted" },
    { label: "Upcoming", value: upcoming, tone: "muted" },
    { label: "Total", value: views.length, tone: "muted" },
  ];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <HrmsCrumbs from={from} />
      <Hero title="Calendar" subtitle="Meetings, site visits and the week ahead across the portfolio">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {metrics.map((mt) => (
            <div key={mt.label} className="flex items-baseline gap-1.5">
              <span className={`text-xl font-semibold tabular ${TONE[mt.tone].text}`}>{mt.value}</span>
              <span className="text-[11px] text-fg-muted">{mt.label}</span>
            </div>
          ))}
        </div>
      </Hero>
      <CalendarBoard events={views} overlays={overlays} people={people} companies={companies} />
    </div>
  );
}
