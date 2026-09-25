import { ensureDefaultAreas, ensureDay, earliestDayKey, listAreas, listChecks, listDays, dayStatus } from "@/lib/operations/cleaning";
import { sb } from "@/db/supabase";
import { StudioCleaningToday, type CleaningHistoryDay } from "@/components/studio/cleaning/studio-cleaning-today";

export const dynamic = "force-dynamic";

const isDateKey = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Cleaning — the administrator's log, Studio (26 Sept 2026, board Cleaning).
 * The receptionist ticks from her portal; this view steps in. `?date=` walks
 * back, never before the earliest record (or 30 days), never into the future —
 * so a hand-typed date cannot create an empty day row.
 */
export default async function CleaningPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10); // EAT
  // Round one: the areas (after making sure the defaults exist), the earliest
  // day and the people — none needs another.
  const [areas, earliest, { data: peopleRaw }] = await Promise.all([
    ensureDefaultAreas().then(() => listAreas()),
    earliestDayKey(),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const floor = earliest && earliest < shift(today, -30) ? earliest : shift(today, -30);
  let dateIso = isDateKey(date) ? date : today;
  if (dateIso > today) dateIso = today;
  if (dateIso < floor) dateIso = floor;

  // Round two: the day (and its ticks) beside the recent days (and theirs).
  const [[day, checks], [recent, allChecks]] = await Promise.all([
    ensureDay(dateIso).then(async (d) => [d, await listChecks(d.id)] as const),
    listDays({ limit: 21 }).then(async (recent) => {
      const ids = recent.map((d) => d.id);
      const { data } = ids.length ? await sb.from("cleaning_checks").select("day_id,done").in("day_id", ids) : { data: [] as { day_id: number; done: boolean }[] };
      return [recent, data] as const;
    }),
  ]);
  const doneBy = new Map<number, number>();
  for (const c of (allChecks ?? []) as { day_id: number; done: boolean }[]) if (c.done) doneBy.set(c.day_id, (doneBy.get(c.day_id) ?? 0) + 1);
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const history: CleaningHistoryDay[] = recent
    .filter((d) => d.date.toISOString().slice(0, 10) !== dateIso)
    .map((d) => {
      const done = doneBy.get(d.id) ?? 0;
      return {
        dateIso: d.date.toISOString().slice(0, 10),
        status: dayStatus(d, done, areas.length),
        cleanerName: d.attendancePersonId ? nameOf.get(d.attendancePersonId) ?? null : null,
        done,
        total: areas.length,
      };
    });

  return <StudioCleaningToday dateIso={dateIso} today={today} floor={floor} day={day} areas={areas} checks={checks} people={people} history={history} />;
}
