import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
      <div>
        <Link href="/" className="inline-flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5 hover:underline">
          <ChevronLeft size={12} /> Home
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">OCR</h1>
        <div className="text-xs text-fg-subtle">Office Cleaning Registry</div>
      </div>

      <OcrToday dateIso={dateIso} today={today} day={day} areas={areas} checks={checks} people={people} />
    </div>
  );
}
