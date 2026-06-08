import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { LeaveBoard } from "@/components/leave-board";
import { listLeaveTypes, listLeaveRequests, listHolidays, leaveMetrics } from "@/lib/leave";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
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

  const sub = `${metrics.pending} pending · ${metrics.onLeaveToday} on leave today · ${types.filter((t) => t.active).length} leave types`;

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader title="Leave & Attendance" sub={sub} />
      <LeaveBoard
        types={types}
        requests={requests}
        holidays={holidays}
        metrics={metrics}
        people={people}
        companies={companies}
      />
    </div>
  );
}
