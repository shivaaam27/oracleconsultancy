import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { listCalendarEvents, toIcsEvent } from "@/lib/calendar";
import { googleCalendarUrl } from "@/lib/ics";
import { sb } from "@/db/supabase";
import { CalendarBoard, type CalendarEventView } from "./calendar-board";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  const [events, { data: peopleRaw }, { data: companiesRaw }] = await Promise.all([
    listCalendarEvents(),
    sb.from("people").select("id,name,email").eq("active", true).order("name"),
    sb.from("companies").select("id,name").order("name"),
  ]);

  const people = (peopleRaw ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    email: (p.email as string) ?? null,
  }));
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  // Pre-compute the share links server-side (the Google URL builder lives next to
  // the .ics builder; keeping it here avoids duplicating the mapping client-side).
  const views: CalendarEventView[] = events.map((ev) => ({
    ...ev,
    companyLabel: ev.companyId ? companyName.get(ev.companyId) ?? null : null,
    googleUrl: googleCalendarUrl(toIcsEvent(ev)),
    icsPath: `/api/calendar/${ev.id}.ics`,
  }));

  const now = Date.now();
  const upcoming = views.filter((e) => new Date(e.startAt).getTime() >= now - 12 * 3600_000).length;
  const sub = `${views.length} event${views.length === 1 ? "" : "s"} · ${upcoming} upcoming`;

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader title="Calendar" sub={sub} />
      <CalendarBoard events={views} people={people} companies={companies} />
    </div>
  );
}
