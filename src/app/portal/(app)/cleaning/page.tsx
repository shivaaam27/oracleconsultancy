import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal/portal-auth";
import { ensureDefaultAreas, ensureDay, listAreas, listChecks, listDays, dayStatus } from "@/lib/operations/cleaning";
import { sb } from "@/db/supabase";
import { StudioCleaningToday, type CleaningHistoryDay } from "@/components/studio/cleaning/studio-cleaning-today";
import type { CleaningHistoryRow } from "@/components/documents/cleaning-overview";
import { StudioCleaningOverview } from "@/components/studio/cleaning/studio-cleaning";

export const dynamic = "force-dynamic";

export default async function PortalCleaningPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const canLog = me.caps.cleaningLog;
  const canView = me.caps.cleaningOverview;
  if (!canLog && !canView) redirect("/portal");

  const todayIso = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10); // EAT, same day as the administrator's log
  // The areas (once the defaults exist) beside today's day and everything that
  // hangs off it. The recent days are read AFTER today's day is made, so a day
  // created by this visit is in the history, as before.
  const [areas, [day, checks, recentDays, allChecks]] = await Promise.all([
    ensureDefaultAreas().then(() => listAreas()),
    ensureDay(todayIso).then(async (day) => {
      const [checks, [recentDays, allChecks]] = await Promise.all([
        listChecks(day.id),
        // Read-only oversight — managers / directors (e.g. Shivam). Recent history with
        // per-day completion, resolved in two batched queries (no N+1).
        listDays({ limit: 14 }).then(async (recentDays) => {
          const dayIds = recentDays.map((d) => d.id);
          const { data } = dayIds.length
            ? await sb.from("cleaning_checks").select("day_id,done").in("day_id", dayIds)
            : { data: [] };
          return [recentDays, data] as const;
        }),
      ]);
      return [day, checks, recentDays, allChecks] as const;
    }),
  ]);
  const doneByDay = new Map<number, number>();
  for (const c of (allChecks ?? []) as { day_id: number; done: boolean }[]) {
    if (c.done) doneByDay.set(c.day_id, (doneByDay.get(c.day_id) ?? 0) + 1);
  }
  const personIds = [...new Set(recentDays.map((d) => d.attendancePersonId).filter((x): x is number => x != null))];
  const { data: ppl } = personIds.length
    ? await sb.from("people").select("id,name").in("id", personIds)
    : { data: [] };
  const nameOf = new Map((ppl ?? []).map((p) => [p.id as number, p.name as string]));
  const total = areas.length;
  const history: CleaningHistoryRow[] = recentDays.map((d) => {
    const done = doneByDay.get(d.id) ?? 0;
    return {
      date: d.date,
      status: dayStatus(d, done, total),
      cleanerName: d.attendancePersonId ? nameOf.get(d.attendancePersonId) ?? null : null,
      done,
      total,
    };
  });
  const todayCleaner = day.attendancePersonId ? nameOf.get(day.attendancePersonId) ?? null : null;

  // Data-entry — the receptionist, on the same Studio screen as the
  // administrator's log, with her own permission-checked actions (26 Sept 2026).
  if (canLog) {
    const people = [{ id: me.id, name: me.name }, ...(day.attendancePersonId && day.attendancePersonId !== me.id && todayCleaner ? [{ id: day.attendancePersonId, name: todayCleaner }] : [])];
    const pastDays: CleaningHistoryDay[] = history
      .filter((h) => h.date.toISOString().slice(0, 10) !== todayIso)
      .map((h) => ({ dateIso: h.date.toISOString().slice(0, 10), status: h.status, cleanerName: h.cleanerName, done: h.done, total: h.total }));
    return <StudioCleaningToday portal={{ name: me.name }} dateIso={todayIso} today={todayIso} floor={todayIso} day={day} areas={areas} checks={checks} people={people} history={pastDays} />;
  }

  // Oversight is a Studio page now (26 Sept 2026) — a manager's only portal
  // page besides Profile, and it wore the old sidebar.
  return <StudioCleaningOverview dateIso={todayIso} day={day} areas={areas} checks={checks} cleanerName={todayCleaner} history={history} />;
}
