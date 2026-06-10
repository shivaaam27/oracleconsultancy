import Link from "next/link";
import { CalendarDays, CheckCircle2, ListTodo, Users } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, visibleTaskIds } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

const OPEN_EXCLUDED = ["Completed", "Closed"];

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

function priorityTone(p: string): "default" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

type Row = {
  id: number;
  code: string;
  action_item: string;
  status: string;
  priority: string;
  deadline: string | null;
  latest_update: string | null;
  company: { name: string } | null;
  teamSize: number;
  mine: boolean;
};

function taskCard(t: Row, now: Date) {
  const od = t.deadline && new Date(t.deadline) < now;
  return (
    <Link key={t.id} href={`/portal/task/${t.code}`} className="block group">
      <Panel className="p-4 transition-shadow group-hover:ring-accent/40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold tabular text-fg-muted">{t.code}</span>
          {t.company && <span className="text-xs text-fg-subtle">· {t.company.name}</span>}
          <span className="grow" />
          <Badge tone={statusTone(t.status)}>{t.status}</Badge>
          <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
        </div>
        <p className="mt-1.5 text-sm font-medium leading-snug">{t.action_item}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
          {t.deadline && (
            <span className={od ? "text-danger font-medium" : undefined}>
              <CalendarDays size={12} className="mr-1 inline -mt-px" />
              Due {new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {od ? " · overdue" : ""}
            </span>
          )}
          {t.teamSize > 1 && (
            <span>
              <Users size={12} className="mr-1 inline -mt-px" />
              Team of {t.teamSize}
            </span>
          )}
          {t.latest_update && <span className="truncate max-w-[24rem]">“{t.latest_update}”</span>}
        </div>
      </Panel>
    </Link>
  );
}

export default async function PortalHome() {
  const me = (await getPortalPerson())!;

  // My own tasks; managers also see their direct reports' tasks.
  const ids = await visibleTaskIds(me);

  let tasks: Row[] = [];
  if (ids.length > 0) {
    const { data } = await sb
      .from("tasks")
      .select("id,code,action_item,status,priority,deadline,latest_update,owner_id,archived,companies(name)")
      .in("id", ids)
      .eq("archived", false)
      .order("deadline", { ascending: true, nullsFirst: false });
    const { data: teams } = await sb
      .from("task_assignees")
      .select("task_id,person_id")
      .in("task_id", ids);
    const teamCount = new Map<number, number>();
    const onTask = new Set<number>();
    for (const r of teams ?? []) {
      const tid = r.task_id as number;
      teamCount.set(tid, (teamCount.get(tid) ?? 0) + 1);
      if ((r.person_id as number) === me.id) onTask.add(tid);
    }
    tasks = (data ?? []).map((t) => ({
      id: t.id as number,
      code: t.code as string,
      action_item: t.action_item as string,
      status: t.status as string,
      priority: t.priority as string,
      deadline: t.deadline as string | null,
      latest_update: t.latest_update as string | null,
      company: (t.companies as unknown as { name: string } | null) ?? null,
      teamSize: teamCount.get(t.id as number) ?? 1,
      mine: onTask.has(t.id as number) || (t.owner_id as number | null) === me.id,
    }));
  }

  const open = tasks.filter((t) => !OPEN_EXCLUDED.includes(t.status));
  const done = tasks.filter((t) => OPEN_EXCLUDED.includes(t.status));
  const myOpen = open.filter((t) => t.mine);
  const teamOpen = open.filter((t) => !t.mine); // managers: direct reports' tasks
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline) < now);
  const dueSoon = open.filter(
    (t) => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekAhead
  );

  const metrics: Array<{ label: string; value: number; tone: keyof typeof TONE; icon: React.ReactNode }> = [
    { label: "Open tasks", value: open.length, tone: "accent", icon: <ListTodo size={15} /> },
    { label: "Due this week", value: dueSoon.length, tone: "warn", icon: <CalendarDays size={15} /> },
    { label: "Overdue", value: overdue.length, tone: overdue.length ? "danger" : "muted", icon: <CalendarDays size={15} /> },
    { label: "Completed", value: done.length, tone: "success", icon: <CheckCircle2 size={15} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={25} />
      <Hero
        title={`Hello, ${me.name.split(" ")[0]}`}
        subtitle={
          overdue.length > 0
            ? `${overdue.length} task${overdue.length === 1 ? " is" : "s are"} overdue — worth a look first.`
            : dueSoon.length > 0
              ? `${dueSoon.length} task${dueSoon.length === 1 ? "" : "s"} due in the next 7 days.`
              : "You're up to date. Nothing due this week."
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className={`rounded-2xl p-3 ring-1 ${TONE[m.tone].bg} ${TONE[m.tone].ring}`}>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${TONE[m.tone].text}`}>
                {m.icon}
                {m.label}
              </div>
              <p className="mt-1 text-2xl font-semibold tabular">{m.value}</p>
            </div>
          ))}
        </div>
      </Hero>

      <section className="flex flex-col gap-2.5">
        <SectionLabel icon={<ListTodo size={13} />}>My tasks</SectionLabel>
        {myOpen.length === 0 && (
          <Panel className="p-6 text-center text-sm text-fg-muted">No open tasks assigned to you right now.</Panel>
        )}
        {myOpen.map((t) => taskCard(t, now))}
      </section>

      {teamOpen.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel icon={<Users size={13} />}>My team&apos;s tasks</SectionLabel>
          {teamOpen.map((t) => taskCard(t, now))}
        </section>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionLabel icon={<CheckCircle2 size={13} />}>Recently completed</SectionLabel>
          {done.slice(0, 5).map((t) => (
            <Link key={t.id} href={`/portal/task/${t.code}`} className="block group">
              <Panel className="p-3.5 opacity-80 transition-opacity group-hover:opacity-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular text-fg-muted">{t.code}</span>
                  <p className="min-w-0 grow truncate text-sm">{t.action_item}</p>
                  <Badge tone="success">{t.status}</Badge>
                </div>
              </Panel>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
