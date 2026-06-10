import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, CheckCheck, Crown, MessageSquare, Pin, PinOff, Users } from "lucide-react";
import { sb } from "@/db/supabase";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { LiveSync } from "@/components/live-sync";
import { getPortalPerson, personCanSeeTask, recordTaskView } from "@/lib/portal-auth";
import { portalAcknowledge, portalAddUpdate, portalTogglePin } from "../../../actions";

export const dynamic = "force-dynamic";

const STAFF_STATUSES = ["In Progress", "Under Review", "Blocked"];
const MANAGER_STATUSES = [...STAFF_STATUSES, "Completed"];

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

/** Maps a created_by stamp to a display name + whether it is "management"
 *  (owner/admin or a portal manager) — management posts get the accent. */
function authorOf(createdBy: string | null, myName: string): { name: string; management: boolean; me: boolean } {
  if (!createdBy) return { name: "System", management: false, me: false };
  if (createdBy.startsWith("portal-mgr:")) {
    const name = createdBy.slice(11);
    return { name: name === myName ? "You" : name, management: true, me: name === myName };
  }
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
  const isManager = me.portalRole === "manager";

  const { data: task } = await sb
    .from("tasks")
    .select("id,code,action_item,status,priority,deadline,comments,created_date,owner_id,companies(name)")
    .eq("code", decodeURIComponent(code))
    .maybeSingle();
  if (!task) notFound();

  // Hard gate: own tasks, or (managers) a direct report's task.
  if (!(await personCanSeeTask(me, task.id as number))) redirect("/portal");

  // Record my view — powers the "Seen" indicator for everyone else.
  await recordTaskView(task.id as number, `person:${me.id}`);

  const [{ data: assignees }, { data: updates }, { data: views }] = await Promise.all([
    sb.from("task_assignees").select("role,people(id,name)").eq("task_id", task.id),
    sb
      .from("task_updates")
      .select("id,body,created_at,created_by,pinned_at")
      .eq("task_id", task.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb.from("task_views").select("viewer,last_viewed_at").eq("task_id", task.id),
  ]);

  // Acknowledgements ("Understood") for this task's pinned instructions.
  const pinnedIds = (updates ?? []).filter((u) => u.pinned_at).map((u) => u.id as number);
  const ackMap = new Map<number, string[]>();
  const myAcks = new Set<number>();
  if (pinnedIds.length > 0) {
    const { data: acks } = await sb
      .from("update_acks")
      .select("update_id,person_id,people(name)")
      .in("update_id", pinnedIds);
    for (const a of acks ?? []) {
      const uid = a.update_id as number;
      const pid = a.person_id as number;
      const nm = (a.people as unknown as { name: string } | null)?.name ?? "Someone";
      ackMap.set(uid, [...(ackMap.get(uid) ?? []), pid === me.id ? "You" : nm]);
      if (pid === me.id) myAcks.add(uid);
    }
  }

  const team = (assignees ?? [])
    .map((a) => {
      const p = a.people as unknown as { id: number; name: string } | null;
      return p ? { ...p, accountable: a.role === "accountable" || p.id === (task.owner_id as number | null) } : null;
    })
    .filter((p): p is { id: number; name: string; accountable: boolean } => Boolean(p));

  // Who has seen the task since the latest update was posted (excluding me).
  const all = (updates ?? []) as Update[];
  const latest = all[0] ?? null;
  const nameById = new Map(team.map((p) => [p.id, p.name]));
  const seenBy: string[] = [];
  if (latest) {
    for (const v of views ?? []) {
      if (new Date(v.last_viewed_at as string) < new Date(latest.created_at)) continue;
      const viewer = v.viewer as string;
      if (viewer === "admin") {
        seenBy.push("Management");
      } else if (viewer.startsWith("person:")) {
        const pid = Number(viewer.slice(7));
        if (pid !== me.id) seenBy.push(nameById.get(pid) ?? "");
      }
    }
  }
  const seenLabel = seenBy.filter(Boolean);

  const pinned = all.filter((u) => u.pinned_at);
  const rest = all.filter((u) => !u.pinned_at);

  const groups: Array<{ label: string; items: Update[] }> = [];
  for (const u of rest) {
    const label = dayLabel(u.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(u);
    else groups.push({ label, items: [u] });
  }

  const closed = task.status === "Completed" || task.status === "Closed";
  const company = task.companies as unknown as { name: string } | null;
  const statusOptions = (isManager ? MANAGER_STATUSES : STAFF_STATUSES).filter((s) => s !== task.status);

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
          {isManager && (
            <form action={portalTogglePin}>
              <input type="hidden" name="updateId" value={u.id} />
              <input type="hidden" name="code" value={task.code as string} />
              <button
                type="submit"
                title={u.pinned_at ? "Unpin" : "Pin as the current instruction"}
                className="text-fg-subtle hover:text-accent transition-colors"
              >
                {u.pinned_at ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
            </form>
          )}
          <span className="text-fg-subtle">
            {new Date(u.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{u.body}</p>
        {latest && u.id === latest.id && seenLabel.length > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-fg-subtle">
            <CheckCheck size={12} className="text-info" /> Seen by {seenLabel.join(", ")}
          </p>
        )}
        {u.pinned_at && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
            {myAcks.has(u.id) ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                <CheckCheck size={12} /> You confirmed you&apos;ve read this
              </span>
            ) : (
              <form action={portalAcknowledge}>
                <input type="hidden" name="updateId" value={u.id} />
                <input type="hidden" name="code" value={task.code as string} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-fg px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 transition-opacity"
                >
                  <Check size={12} /> Understood
                </button>
              </form>
            )}
            {(ackMap.get(u.id)?.length ?? 0) > 0 && (
              <span className="text-[11px] text-fg-subtle">Read by {ackMap.get(u.id)!.join(", ")}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <LiveSync taskId={task.id as number} seconds={5} />

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
          {team.length > 0 && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Users size={12} />
              {team.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-0.5">
                  {p.accountable && <Crown size={11} className="text-warn" />}
                  {p.id === me.id ? "You" : p.name}
                </span>
              ))}
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
                  {statusOptions.map((s) => (
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
              {isManager
                ? "As a manager you can mark this task Completed once you're satisfied."
                : "Marking work finished? Choose Under Review — your manager confirms completion."}
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
