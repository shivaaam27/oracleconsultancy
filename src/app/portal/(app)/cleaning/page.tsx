import { redirect } from "next/navigation";
import { getPortalPerson } from "@/lib/portal-auth";
import { ensureDefaultAreas, ensureDay, listAreas, listChecks, listDays, dayStatus } from "@/lib/cleaning";
import { sb } from "@/db/supabase";
import { PortalCleaning } from "@/components/portal-cleaning";
import { CleaningOverview, type CleaningHistoryRow } from "@/components/cleaning-overview";
import { SprayCan } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PortalCleaningPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const canLog = me.caps.cleaningLog;
  const canView = me.caps.cleaningOverview;
  if (!canLog && !canView) redirect("/portal");

  await ensureDefaultAreas();
  const todayIso = new Date().toISOString().slice(0, 10);
  const [day, areas] = await Promise.all([ensureDay(todayIso), listAreas()]);
  const checks = await listChecks(day.id);

  const header = (
    <div className="mb-4">
      <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <SprayCan size={18} className="text-accent" /> Office Cleaning
      </h1>
      <p className="text-xs text-fg-subtle">
        {canLog ? "Tick each room as you clean it, add a note if needed, then submit the day." : "Daily cleaning register — who cleaned what, and when."}
      </p>
    </div>
  );

  // Data-entry — the receptionist.
  if (canLog) {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <PortalCleaning dateIso={todayIso} day={day} areas={areas} checks={checks} />
      </div>
    );
  }

  // Read-only oversight — managers / directors (e.g. Shivam). Recent history with
  // per-day completion, resolved in two batched queries (no N+1).
  const recentDays = await listDays({ limit: 14 });
  const dayIds = recentDays.map((d) => d.id);
  const { data: allChecks } = dayIds.length
    ? await sb.from("cleaning_checks").select("day_id,done").in("day_id", dayIds)
    : { data: [] };
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

  return (
    <div className="mx-auto max-w-2xl">
      {header}
      <CleaningOverview dateIso={todayIso} day={day} areas={areas} checks={checks} cleanerName={todayCleaner} history={history} />
    </div>
  );
}
