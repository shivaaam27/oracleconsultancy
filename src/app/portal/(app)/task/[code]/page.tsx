import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Crown, MessageCircle, MessageSquare, Users } from "lucide-react";
import { sb } from "@/db/supabase";
import { Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { LiveSync } from "@/components/live-sync";
import { PortalConversation, type ConvoMessage, type ConvoEvent } from "@/components/portal-conversation";
import { PinnedMarker, WaitingOnChip } from "@/components/task-meta-line";
import { TaskQuickActions } from "@/components/task-quick-actions";
import { PortalTaskMessage } from "@/components/portal-task-message";
import { getPortalPerson, personCanSeeTask, recordTaskView } from "@/lib/portal-auth";
import { getStaffIdMap } from "@/lib/staff-id";
import { StaffIdChip } from "@/components/staff-id-chip";
import { portalAddUpdate, portalTogglePin, portalAcknowledge } from "../../../actions";
import { taskStatusTone as statusTone, priorityTone } from "@/lib/badge-tones";
import type { TaskRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STAFF_STATUSES = ["In Progress", "Under Review", "Blocked"];

/** Maps a created_by stamp to a display name + whether it is "management"
 *  (owner/admin or a portal manager) — management posts get the accent. */
function authorOf(createdBy: string | null, myName: string): { name: string; management: boolean; me: boolean } {
  if (!createdBy) return { name: "System", management: false, me: false };
  if (createdBy.startsWith("portal-dir:")) {
    const name = createdBy.slice(11);
    return { name: name === myName ? "You" : name, management: true, me: name === myName };
  }
  if (createdBy.startsWith("portal-mgr:")) {
    const name = createdBy.slice(11);
    return { name: name === myName ? "You" : name, management: true, me: name === myName };
  }
  if (createdBy.startsWith("portal:")) {
    const name = createdBy.slice(7);
    return { name: name === myName ? "You" : name, management: false, me: name === myName };
  }
  if (createdBy === "ai-command") return { name: "ORI", management: true, me: false };
  return { name: "Management", management: true, me: false };
}

type Update = {
  id: number;
  body: string;
  created_at: string;
  created_by: string | null;
  pinned_at: string | null;
  parent_update_id: number | null;
  attachment_document_id: number | null;
};

export default async function PortalTaskPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  const { code } = await params;
  const isManager = me.portalRole === "manager";
  const isManagement = isManager || me.portalRole === "director" || me.portalRole === "hr";

  const { data: task } = await sb
    .from("tasks")
    .select("id,code,action_item,status,priority,deadline,comments,created_date,owner_id,created_by_person_id,requires_attachment,companies(name)")
    .eq("code", decodeURIComponent(code))
    .maybeSingle();
  if (!task) notFound();

  // Hard gate: own tasks, or (managers) a direct report's task.
  if (!(await personCanSeeTask(me, task.id as number))) redirect("/portal");

  // Record my view — powers the "Seen" indicator for everyone else.
  await recordTaskView(task.id as number, `person:${me.id}`);

  const [{ data: assignees }, { data: updates }, { data: views }, staffIds] = await Promise.all([
    sb.from("task_assignees").select("role,people(id,name)").eq("task_id", task.id),
    sb
      .from("task_updates")
      .select("id,body,created_at,created_by,pinned_at,parent_update_id,attachment_document_id")
      .eq("task_id", task.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb.from("task_views").select("viewer,last_viewed_at").eq("task_id", task.id),
    getStaffIdMap(),
  ]);

  // Who assigned this task — when a portal user (typically a director) created
  // it, surface a quiet "Assigned by {Name}" line in the header meta.
  const assignedById = task.created_by_person_id as number | null;
  let assignedByName: string | null = null;
  if (assignedById) {
    if (assignedById === me.id) assignedByName = "You";
    else {
      const { data: assigner } = await sb
        .from("people")
        .select("name")
        .eq("id", assignedById)
        .maybeSingle();
      assignedByName = (assigner?.name as string | null) ?? null;
    }
  }

  // System events (status/deadline/priority/etc.) → thin inline markers.
  const { data: auditRows } = await sb
    .from("audit_log")
    .select("id,field,old_value,new_value,created_at")
    .eq("task_code", task.code as string)
    .eq("entry_type", "CHANGE")
    .in("field", ["status", "deadline", "priority", "risk", "escalation"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const fmtDate = (v: string) => {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  const events: ConvoEvent[] = (auditRows ?? []).map((a) => {
    const f = a.field as string;
    const nv = (a.new_value as string | null) ?? "";
    let text: string;
    if (f === "status") text = `Status → ${nv}`;
    else if (f === "deadline") text = nv ? `Deadline → ${fmtDate(nv)}` : "Deadline cleared";
    else if (f === "priority") text = `Priority → ${nv}`;
    else if (f === "risk") text = `Risk → ${nv}`;
    else if (f === "escalation") text = nv ? `Escalation → ${nv}` : "Escalation cleared";
    else text = `${f} → ${nv}`;
    return { id: `a${a.id}`, at: a.created_at as string, text };
  });

  const all = (updates ?? []) as Update[];

  // Acknowledgements ("Understood") for this task's pinned instructions.
  const pinnedIds = all.filter((u) => u.pinned_at).map((u) => u.id);
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

  // Teammates I can start a direct chat with (the team minus me).
  const mates = team.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }));

  // Seen indicator — who has viewed since the latest message (excluding me).
  const latest = all[0] ?? null;
  const nameById = new Map(team.map((p) => [p.id, p.name]));
  const seenBy: string[] = [];
  if (latest) {
    for (const v of views ?? []) {
      if (new Date(v.last_viewed_at as string) < new Date(latest.created_at)) continue;
      const viewer = v.viewer as string;
      if (viewer === "admin") seenBy.push("Management");
      else if (viewer.startsWith("person:")) {
        const pid = Number(viewer.slice(7));
        if (pid !== me.id) seenBy.push(nameById.get(pid) ?? "");
      }
    }
  }
  const seenLabel = seenBy.filter(Boolean);

  // Body lookup for reply previews.
  const bodyById = new Map(all.map((u) => [u.id, { body: u.body, author: authorOf(u.created_by, me.name).name }]));

  // Attachment file names for messages that carry a document.
  const attachIds = all.map((u) => u.attachment_document_id).filter((x): x is number => x != null);
  const attachName = new Map<number, string>();
  if (attachIds.length > 0) {
    const { data: docs } = await sb.from("documents").select("id,file_name,title").in("id", attachIds);
    for (const d of docs ?? []) attachName.set(d.id as number, (d.file_name as string | null) || (d.title as string) || "Attachment");
  }

  const messages: ConvoMessage[] = all.map((u) => {
    const a = authorOf(u.created_by, me.name);
    const parentRef = u.parent_update_id ? bodyById.get(u.parent_update_id) : null;
    return {
      id: u.id,
      body: u.body,
      at: u.created_at,
      authorName: a.name,
      management: a.management,
      me: a.me,
      pinned: Boolean(u.pinned_at),
      parent: parentRef ? { authorName: parentRef.author, snippet: parentRef.body.slice(0, 80) } : null,
      ackNames: u.pinned_at ? ackMap.get(u.id) ?? [] : [],
      iAcked: myAcks.has(u.id),
      attachment: u.attachment_document_id ? { name: attachName.get(u.attachment_document_id) ?? "Attachment" } : null,
    };
  });

  const closed = task.status === "Completed" || task.status === "Closed";
  const company = task.companies as unknown as { name: string } | null;
  // The header's aurora wash + leading dot take the task's status colour, so the
  // whole sheet reads "blocked" (red) / "in progress" (blue) at a glance.
  const headerSt = statusTone(task.status as string);
  const washVar = headerSt === "default" ? "accent" : headerSt;
  const dotTone: keyof typeof TONE = headerSt === "default" ? "muted" : headerSt;
  // Completing/closing is not a plain status move anymore — it goes through the
  // secure gate (the "Complete" action), which requires a note + any proof. So
  // the composer only offers the open statuses, for every role.
  const statusOptions = STAFF_STATUSES.filter((s) => s !== task.status);

  // A minimal TaskRow-shaped object to drive the shared Aurora markers (pinned /
  // waiting). Presentational only — derived from data we already loaded.
  const hasPinned = all.some((u) => u.pinned_at);
  const preview = {
    status: task.status as string,
    pinned: hasPinned,
    waiting: task.status === "Blocked" || task.status === "Waiting External",
  } as unknown as TaskRow;
  // The freshest update for the "latest activity" glance in Overview.
  const latestUpdate = latest;
  const latestAuthor = latestUpdate ? authorOf(latestUpdate.created_by, me.name).name : null;
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      <LiveSync taskId={task.id as number} seconds={5} />

      <Link href={isManagement ? "/portal/tasks" : "/portal"} className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors">
        <ArrowLeft size={15} /> {isManagement ? "All tasks" : "My tasks"}
      </Link>

      <Reveal delay={0}>
      <section className="relative overflow-hidden rounded-3xl glass elevated p-4 sm:p-5">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, hsl(var(--${washVar}) / 0.18), transparent 70%)` }} />
          <div className="absolute -bottom-24 -left-20 h-56 w-56 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--info) / 0.12), transparent 72%)" }} />
        </div>
        <div className="relative">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${TONE[dotTone].bar}`} aria-hidden />
          <span className="text-xs font-semibold tabular text-fg-muted">{task.code}</span>
          {company && <span className="text-xs text-fg-subtle">· {company.name}</span>}
          <PinnedMarker task={preview} />
          <span className="grow" />
          <Badge tone={statusTone(task.status as string)}>{task.status}</Badge>
          <Badge tone={priorityTone(task.priority as string)}>{task.priority}</Badge>
        </div>
        <h1 className="mt-2 text-lg font-semibold leading-snug">{task.action_item}</h1>
        <WaitingOnChip task={preview} on={team.find((p) => p.accountable)?.name} className="mt-2" />
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-fg-muted">
          {assignedByName && <span className="text-fg-subtle">Assigned by {assignedByName}</span>}
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
                <span key={p.id} className="inline-flex items-center gap-1">
                  {p.accountable && <Crown size={11} className="text-warn" />}
                  {p.id === me.id ? "You" : p.name}
                  <StaffIdChip id={staffIds.get(p.id)} />
                </span>
              ))}
            </span>
          )}
        </div>
        {task.comments && (
          <p className="mt-3 text-sm text-fg-muted whitespace-pre-wrap">{task.comments}</p>
        )}
        {/* Latest-activity glance — mirrors the admin pop-up Overview rhythm.
            Tap to drop to the full conversation below. */}
        {latestUpdate && latestAuthor && (
          <a
            href="#conversation"
            className="mt-3 flex items-start gap-2 rounded-2xl bg-bg-subtle/70 ring-1 ring-border/60 px-3 py-2.5 text-left transition-colors hover:ring-accent/40"
          >
            <MessageSquare size={14} className="mt-0.5 shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block text-[11px] text-fg-subtle">
                {latestAuthor} · {fmtWhen(latestUpdate.created_at)}
                {all.length > 1 ? ` · ${all.length} updates` : ""}
              </span>
              <span className="block truncate text-sm text-fg-muted">{latestUpdate.body}</span>
            </span>
          </a>
        )}
        </div>
      </section>
      </Reveal>

      <Reveal delay={0.04}>
        <TaskQuickActions
          taskId={task.id as number}
          code={task.code as string}
          ownerName={team.find((p) => p.accountable)?.name ?? null}
          ownerId={team.find((p) => p.accountable)?.id ?? null}
          canRemind={isManagement}
          canComplete={!closed}
          requiresAttachment={(task.requires_attachment as boolean) ?? false}
        />
      </Reveal>

      {/* Message a teammate — start (or continue) a direct chat with anyone else
          on this task. Everyone↔everyone, so offered to every role. */}
      {mates.length > 0 && (
        <Reveal delay={0.045}>
          <div className="flex flex-col gap-2">
            <SectionLabel icon={<MessageCircle size={13} />}>Message a teammate</SectionLabel>
            <PortalTaskMessage people={mates} />
          </div>
        </Reveal>
      )}

      <Reveal delay={0.05}>
      <div id="conversation" className="scroll-mt-4">
        <SectionLabel icon={<MessageSquare size={13} />}>Conversation &amp; history</SectionLabel>
      </div>
      </Reveal>

      <Reveal delay={0.08}>
      <PortalConversation
        taskId={task.id as number}
        code={task.code as string}
        closed={closed}
        statusOptions={statusOptions}
        currentStatus={task.status as string}
        messages={messages}
        events={events}
        latestId={latest?.id ?? null}
        seenLabel={seenLabel}
        team={team.map((p) => ({ id: p.id, name: p.name }))}
        addAction={portalAddUpdate}
        pinAction={portalTogglePin}
        ackAction={portalAcknowledge}
        canPin={isManagement}
        canAck={true}
        composerHint={
          isManagement
            ? "You can mark this task Completed once you're satisfied."
            : "Marking work finished? Choose Under Review — your manager confirms completion."
        }
      />
      </Reveal>
    </div>
  );
}
