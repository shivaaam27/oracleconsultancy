import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, MessageSquare, Pin, Users } from "lucide-react";
import { sb } from "@/db/supabase";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPortalPerson, personOnTask } from "@/lib/portal-auth";
import { portalAddUpdate } from "../../../actions";

export const dynamic = "force-dynamic";

const PORTAL_STATUSES = ["In Progress", "Under Review", "Blocked"];

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

/** Maps a created_by stamp to a display name + whether it is "management"
 *  (the owner/admin side) — management posts get the accent treatment. */
function authorOf(createdBy: string | null, myName: string): { name: string; management: boolean; me: boolean } {
  if (!createdBy) return { name: "System", management: false, me: false };
  if (createdBy.startsWith("portal:")) {
    const name = createdBy.slice(7);
    return { name: name === myName ? "You" : name, management: false, me: name === myName };
  }
  if (createdBy === "ai-command") return { name: "COS Assistant", management: true, me: false };
  return { name: "Management", management: true, me: false };
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

type Update = {
  id: number;
  body: string;
  created_at: string;
  created_by: string | null;
  pinned_at: string | null;
};

export default async function PortalTaskPage({ params }: { params: Promise<{ code: string }> }) {
  const me = (await getPortalPerson())!;
  const { code } = await params;

  const { data: task } = await sb
    .from("tasks")
    .select("id,code,action_item,status,priority,deadline,comments,created_date,companies(name)")
    .eq("code", decodeURIComponent(code))
    .maybeSingle();
  if (!task) notFound();

  // Hard gate: only people on this task may see it.
  if (!(await personOnTask(me.id, task.id as number))) redirect("/portal");

  const [{ data: assignees }, { data: updates }] = await Promise.all([
    sb.from("task_assignees").select("people(id,name)").eq("task_id", task.id),
    sb
      .from("task_updates")
      .select("id,body,created_at,created_by,pinned_at")
      .eq("task_id", task.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const team = (assignees ?? [])
    .map((a) => (a.people as unknown as { id: number; name: string } | null))
    .filter((p): p is { id: number; name: string } => Boolean(p));

  const all = (updates ?? []) as Update[];
  const pinned = all.filter((u) => u.pinned_at);
  const rest = all.filter((u) => !u.pinned_at);

  // Group by day, newest first. Today + yesterday open; older days collapsed.
  const groups: Array<{ label: string; items: Update[] }> = [];
  for (const u of rest) {
    const label = dayLabel(u.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(u);
    else groups.push({ label, items: [u] });
  }

  const closed = task.status === "Completed" || task.status === "Closed";
  const company = task.companies as unknown as { name: string } | null;

  const renderUpdate = (u: Update) => {
    const a = authorOf(u.created_by, me.name);
    return (
      <div
        key={u.id}
        className={`rounded-2xl p-3 ring-1 ${
          a.management ? "bg-accent-soft/50 ring-accent/20" : "bg-bg-subtle/60 ring-border"
        }`}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-semibold ${a.management ? "text-accent" : a.me ? "text-fg" : "text-fg-muted"}`}>
            {a.name}
          </span>
          {u.pinned_at && (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <Pin size={11} /> Pinned
            </span>
          )}
          <span className="grow" />
          <span className="text-fg-subtle">
            {new Date(u.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{u.body}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={15} />

      <Link href="/portal" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors">
        <ArrowLeft size={15} /> My tasks
      </Link>

      <Panel glass className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold tabular text-fg-muted">{task.code}</span>
          {company && <span className="text-xs text-fg-subtle">· {company.name}</span>}
          <span className="grow" />
          <Badge tone={statusTone(task.status as string)}>{task.status}</Badge>
          <Badge tone="default">{task.priority}</Badge>
        </div>
        <h1 className="mt-2 text-lg font-semibold leading-snug">{task.action_item}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-fg-muted">
          {task.deadline && (
            <span>
              <CalendarDays size={12} className="mr-1 inline -mt-px" />
              Due {new Date(task.deadline as string).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          )}
          {team.length > 1 && (
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> Team:{" "}
              {team.map((p) => (p.id === me.id ? "You" : p.name)).join(", ")}
            </span>
          )}
        </div>
        {task.comments && <p className="mt-3 text-sm text-fg-muted whitespace-pre-wrap">{task.comments}</p>}
      </Panel>

      {!closed && (
        <Panel className="p-4">
          <SectionLabel icon={<MessageSquare size={13} />}>Post an update</SectionLabel>
          <form action={portalAddUpdate} className="mt-2.5 flex flex-col gap-2.5">
            <input type="hidden" name="taskId" value={task.id as number} />
            <input type="hidden" name="code" value={task.code as string} />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="What's the latest? Keep it short and factual."
              className="w-full resize-y rounded-2xl bg-bg-subtle ring-1 ring-border px-3.5 py-2.5 text-sm outline-none focus:ring-accent/50"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                Move status to
                <select
                  name="newStatus"
                  defaultValue=""
                  className="rounded-xl bg-bg-subtle ring-1 ring-border px-2.5 py-1.5 text-xs outline-none"
                >
                  <option value="">No change</option>
                  {PORTAL_STATUSES.filter((s) => s !== task.status).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-full bg-accent text-accent-fg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Post update
              </button>
            </div>
            <p className="text-[11px] text-fg-subtle">
              Marking work finished? Choose <span className="font-medium">Under Review</span> — your manager confirms completion.
            </p>
          </form>
        </Panel>
      )}

      <section className="flex flex-col gap-2.5">
        <SectionLabel icon={<MessageSquare size={13} />}>Timeline</SectionLabel>
        {pinned.length > 0 && <div className="flex flex-col gap-2">{pinned.map(renderUpdate)}</div>}
        {groups.length === 0 && pinned.length === 0 && (
          <Panel className="p-5 text-center text-sm text-fg-muted">No updates yet — post the first one above.</Panel>
        )}
        {groups.map((g, i) =>
          i < 2 ? (
            <div key={g.label} className="flex flex-col gap-2">
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{g.label}</p>
              {g.items.map(renderUpdate)}
            </div>
          ) : (
            <details key={g.label} className="group/d">
              <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle hover:text-fg-muted transition-colors">
                {g.label} · {g.items.length} update{g.items.length === 1 ? "" : "s"} — tap to show
              </summary>
              <div className="mt-1 flex flex-col gap-2">{g.items.map(renderUpdate)}</div>
            </details>
          )
        )}
      </section>
    </div>
  );
}
