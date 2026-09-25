import { listHolidays } from "@/lib/people/leave";
import { getAttendanceMonth } from "@/lib/people/attendance";
import { sb } from "@/db/supabase";
import { StudioAttendance } from "@/components/studio/attendance/studio-attendance";

export const dynamic = "force-dynamic";

/**
 * Attendance — Studio (26 Sept 2026, board Attendance). The month register you
 * paint, and the public holidays that fill it by themselves. The wider Leave
 * module (requests, approvals, balances) was retired in July 2026.
 * `?ym=YYYY-MM` picks the month, `?view=holidays` the Holidays list, `?co=` a company.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ view?: string; ym?: string }> }) {
  const { view, ym } = await searchParams;
  const eat = new Date(Date.now() + 3 * 3_600_000);
  let y = eat.getUTCFullYear(), m = eat.getUTCMonth() + 1;
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [yy, mm] = ym.split("-").map(Number);
    if (mm >= 1 && mm <= 12) { y = yy; m = mm; }
  }
  const [holidays, { data: companies }, month] = await Promise.all([
    listHolidays(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    getAttendanceMonth(y, m),
  ]);
  return (
    <StudioAttendance
      month={month}
      holidays={holidays}
      companies={(companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string }))}
      view={view === "holidays" ? "holidays" : "register"}
    />
  );
}
