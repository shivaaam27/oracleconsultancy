import Link from "next/link";
import { Clock, PartyPopper } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { AttendanceRegister } from "@/components/attendance-register";
import { HolidaysAdmin } from "@/components/holidays-admin";
import { listHolidays } from "@/lib/leave";
import { getAttendanceMonth } from "@/lib/attendance";
import { sb } from "@/db/supabase";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * Attendance register. The wider Leave module (requests, approvals, balances,
 * leave types) was retired — attendance is the surviving half. Public holidays
 * stay here because the register auto-fills them, so they must remain editable.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; view?: string; ym?: string }>;
}) {
  const { from, view, ym } = await searchParams;
  const tab = view === "holidays" ? "holidays" : "attendance";

  const now = new Date();
  let attYear = now.getUTCFullYear(), attMonth = now.getUTCMonth() + 1;
  if (ym && /^\d{4}-\d{2}$/.test(ym)) { const [y, m] = ym.split("-").map(Number); attYear = y; attMonth = m; }

  const [holidays, { data: companiesRaw }, attendanceMonth] = await Promise.all([
    listHolidays(),
    sb.from("companies").select("id,name").order("name"),
    tab === "attendance" ? getAttendanceMonth(attYear, attMonth) : Promise.resolve(null),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = holidays.filter((h) => h.date.slice(0, 10) >= today).length;
  const sub = `${upcoming} upcoming holiday${upcoming === 1 ? "" : "s"}`;
  const tabCls = (active: boolean) => cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors",
    active ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60");

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <HrmsCrumbs from={from} />
      <PageHeader title="Attendance" sub={sub} />

      <div className="inline-flex items-center gap-1 rounded-full bg-bg-subtle/70 ring-1 ring-border p-1">
        <Link href="/hrms/leave" className={tabCls(tab === "attendance")}><Clock size={14} /> Register</Link>
        <Link href="/hrms/leave?view=holidays" className={tabCls(tab === "holidays")}><PartyPopper size={14} /> Holidays</Link>
      </div>

      {tab === "attendance" && attendanceMonth ? (
        <AttendanceRegister month={attendanceMonth} companies={companies} />
      ) : (
        <HolidaysAdmin holidays={holidays} companies={companies} />
      )}
    </div>
  );
}
