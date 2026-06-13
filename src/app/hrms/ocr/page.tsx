import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { PageHeader } from "@/components/ui";
import { OcrToday } from "@/components/hrms/ocr-today";
import { ensureDefaultAreas, ensureDay, listAreas, listChecks } from "@/lib/cleaning";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

const isDateKey = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function OcrPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await ensureDefaultAreas();
  const { date } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const dateIso = isDateKey(date) ? date : today;

  const [day, areas, { data: peopleRaw }] = await Promise.all([
    ensureDay(dateIso),
    listAreas(),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const checks = await listChecks(day.id);
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <HrmsCrumbs />
      <PageHeader title="OCR" sub="Office Cleaning Registry" />

      <OcrToday dateIso={dateIso} today={today} day={day} areas={areas} checks={checks} people={people} />
    </div>
  );
}
