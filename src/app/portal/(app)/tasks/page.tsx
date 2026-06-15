import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds } from "@/lib/portal-auth";
import { PortalTasksTable, type PortalTaskRow } from "@/components/portal-tasks-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks — Oracle Consultancy" };

export default async function PortalTasksPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");

  const ids = await visibleTaskIds(me);

  let rows: PortalTaskRow[] = [];
  if (ids.length > 0) {
    const [{ data: tasks }, { data: assignees }] = await Promise.all([
      sb
        .from("tasks")
        .select("id,code,action_item,status,priority,deadline,owner_id,created_by_person_id,companies(name)")
        .in("id", ids)
        .eq("archived", false)
        .order("deadline", { ascending: true, nullsFirst: false }),
      sb.from("task_assignees").select("task_id,person_id").in("task_id", ids),
    ]);

    // Owner names — one lookup for every owner referenced.
    const ownerIds = Array.from(
      new Set((tasks ?? []).map((t) => t.owner_id as number | null).filter((x): x is number => x != null))
    );
    const { data: owners } = ownerIds.length
      ? await sb.from("people").select("id,name").in("id", ownerIds)
      : { data: [] as { id: number; name: string }[] };
    const ownerName = new Map((owners ?? []).map((o) => [o.id as number, o.name as string]));

    const teamCount = new Map<number, number>();
    const onTask = new Set<number>();
    for (const r of assignees ?? []) {
      const tid = r.task_id as number;
      teamCount.set(tid, (teamCount.get(tid) ?? 0) + 1);
      if ((r.person_id as number) === me.id) onTask.add(tid);
    }

    rows = (tasks ?? []).map((t) => ({
      id: t.id as number,
      code: t.code as string,
      actionItem: t.action_item as string,
      status: t.status as string,
      priority: t.priority as string,
      deadline: t.deadline as string | null,
      companyName: (t.companies as unknown as { name: string } | null)?.name ?? null,
      ownerName: ownerName.get((t.owner_id as number | null) ?? -1) ?? null,
      teamSize: teamCount.get(t.id as number) ?? 1,
      mine: onTask.has(t.id as number) || (t.owner_id as number | null) === me.id,
      raisedByMe: (t.created_by_person_id as number | null) === me.id,
    }));
  }

  const canRaise = me.portalRole !== "staff";
  const scopeNote =
    me.portalRole === "hr" || me.portalRole === "director"
      ? "Every task across all companies."
      : me.portalRole === "manager"
        ? "Your company's tasks, plus your own and your team's."
        : "Tasks assigned to you.";

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={30} />
      <Reveal delay={0}>
        <Hero title="Tasks" subtitle={scopeNote}>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <ClipboardList size={15} />
            {rows.length} task{rows.length === 1 ? "" : "s"} in view
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <PortalTasksTable rows={rows} canRaise={canRaise} />
      </Reveal>
    </div>
  );
}
