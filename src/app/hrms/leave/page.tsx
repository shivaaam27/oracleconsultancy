import Link from "next/link";
import { CalendarDays, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { LeaveBoard } from "@/components/leave-board";
import { AttendanceRegister } from "@/components/attendance-register";
import { listLeaveTypes, listLeaveRequests, listHolidays, leaveMetrics } from "@/lib/leave";
import { getAttendanceMonth } from "@/lib/attendance";
import { sb } from "@/db/supabase";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; view?: string; ym?: string }>;
}) {
  const { from, view, ym } = await searchParams;
  const tab = view === "attendance" ? "attendance" : "leave";

  const [types, requests, holidays, metrics, { data: peopleRaw }, { data: companiesRaw }] = await Promise.all([
    listLeaveTypes(true),
    listLeaveRequests(),
    listHolidays(),
    leaveMetrics(),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    sb.from("companies").select("id,name").order("name"),
  ]);
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  // Attendance month (only loaded for the attendance tab).
  const now = new Date();
  let attYear = now.getUTCFullYear(), attMonth = now.getUTCMonth() + 1;
  if (ym && /^\d{4}-\d{2}$/.test(ym)) { const [y, m] = ym.split("-").map(Number); attYear = y; attMonth = m; }
  const attendanceMonth = tab === "attendance" ? await getAttendanceMonth(attYear, attMonth) : null;

  const sub = `${metrics.pending} pending · ${metrics.onLeaveToday} on leave today · ${types.filter((t) => t.active).length} leave types`;
  const tabCls = (active: boolean) => cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors",
    active ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg hover:bg-bg-muted/60");

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader title="Leave & Attendance" sub={sub} />

      <div className="inline-flex items-center gap-1 rounded-full bg-bg-subtle/70 ring-1 ring-border p-1">
        <Link href="/hrms/leave" className={tabCls(tab === "leave")}><CalendarDays size={14} /> Leave</Link>
        <Link href="/hrms/leave?view=attendance" className={tabCls(tab === "attendance")}><Clock size={14} /> Attendance</Link>
      </div>

      {tab === "attendance" && attendanceMonth ? (
        <AttendanceRegister month={attendanceMonth} companies={companies} />
      ) : (
        <LeaveBoard types={types} requests={requests} holidays={holidays} metrics={metrics} people={people} companies={companies} />
      )}
    </div>
  );
}
