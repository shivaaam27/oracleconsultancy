import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { OcrToday } from "@/components/hrms/ocr-today";
import { ensureDefaultAreas, ensureDay, earliestDayKey, listAreas, listChecks } from "@/lib/cleaning";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

const isDateKey = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default async function OcrPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await ensureDefaultAreas();
  const { date } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  // Floor for browsing: never page back beyond the earliest real record, and at
  // most 30 days back otherwise — so a hand-typed ?date= can't silently create an
  // empty cleaning-day row for an arbitrary historical (or far-future) date.
  const earliest = await earliestDayKey();
  const floor = earliest && earliest < shift(today, -30) ? earliest : shift(today, -30);

  let dateIso = isDateKey(date) ? date : today;
  if (dateIso > today) dateIso = today;
  if (dateIso < floor) dateIso = floor;

  const [day, areas, { data: peopleRaw }] = await Promise.all([
    ensureDay(dateIso),
    listAreas(),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const checks = await listChecks(day.id);
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <HrmsCrumbs />
          <h1 className="text-lg font-semibold tracking-tight">OCR</h1>
          <div className="text-xs text-fg-subtle">Office Cleaning Registry — overview &amp; control. The receptionist logs the daily cleaning from her portal; this view reflects her ticks and lets you step in when needed.</div>
        </div>
      </div>

      <OcrToday dateIso={dateIso} today={today} floor={floor} day={day} areas={areas} checks={checks} people={people} />
    </div>
  );
}
