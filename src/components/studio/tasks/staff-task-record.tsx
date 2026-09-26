"use client";

/**
 * A task, for a member of STAFF, in Studio (26 Sept 2026, mockup S_Task) — the
 * owner's task page in three columns, with what staff can do and no more:
 *
 *   dark band · ‹ back · code · company · Send for review · I'm blocked · (Complete)
 *   Details (read-only) │ Conversation · History │ People · Subtasks
 *
 * - Send for review = an update that moves it to Under Review, with a note.
 * - I'm blocked = who it waits on and why (the portal's own blocker action).
 * - Complete only on a task they raised — the secure gate (note, proof).
 * - Status on an update: In Progress · Under Review · Blocked only.
 * Every action is an existing portal action, which re-checks the task.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PauseCircle, Pencil, Play, Send } from "lucide-react";
import { StudioScope, stBtn } from "@/components/studio/kit";
import { StudioSheet } from "@/components/studio/sheet";
import { PersonFace } from "@/components/studio/face";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { TaskSubtasks, fetchSubtasks } from "@/components/studio/subtasks";
import { StudioBlocker } from "./blocker";
import { STATUS_DOT } from "./task-words";
import { BackLink } from "@/components/shell/back-link";
import { CompleteTaskSheet } from "@/components/tasks/complete-task-sheet";
import { PortalConversation, type ConvoMessage, type ConvoEvent } from "@/components/portal/portal-conversation";
import { portalAddUpdate, portalTogglePin, portalAcknowledge, portalEditUpdate, portalDeleteUpdate, portalEditTask } from "@/app/portal/actions";
import { useToast } from "@/components/shell/toast";
import { getGivenName } from "@/lib/people/names";
import { cn } from "@/lib/cn";

export type StaffTaskData = {
  id: number;
  code: string;
  title: string;
  status: string;
  priority: string;
  companyName: string | null;
  deadline: { words: string; tone: "late" | "soon" | "ok" } | null;
  closed: boolean;
  canComplete: boolean;
  /** Only when the owner has let staff manage tasks (the server's own rule). */
  canEdit: boolean;
  requiresAttachment: boolean;
  blockedOnPersonId: number | null;
  blockedReason: string | null;
  details: { label: string; value: string }[];
  description: string | null;
  people: { id: number; name: string; role: string; me: boolean }[];
  blockPeople: { id: number; name: string }[];
  convo: {
    statusOptions: string[];
    messages: ConvoMessage[];
    events: ConvoEvent[];
    latestId: number | null;
    seenLabel: string[];
    team: { id: number; name: string }[];
  };
  history: { at: string; text: string }[];
};

const DUE_ON_CARD: Record<string, string> = { late: "#F07BBE", soon: "#F5B94E", ok: "#C9CBCF" };
const STARTERS: [string, string][] = [
  ["Still on it", "Still on it — "],
  ["Waiting on", "Waiting on "],
  ["Done, ready for review", "Done, ready for review. "],
  ["Need a decision", "Need a decision on "],
];

export function StaffTaskRecord({ t }: { t: StaffTaskData }) {
  const router = useRouter();
  const grid = useRef<HTMLDivElement>(null);
  useFitFrame(grid, { deps: [t.code] });
  const [tab, setTab] = useState<"conversation" | "subtasks" | "details" | "history">("conversation");
  const [sub, setSub] = useState<{ done: number; total: number } | null>(null);
  // Fetch the subtasks now, so the tab opens with them already there.
  useEffect(() => { fetchSubtasks(t.id).then((l) => setSub({ done: l.filter((x) => x.done).length, total: l.length })).catch(() => {}); }, [t.id]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const inReview = t.status === "Under Review";
  // Start — the way a member of staff moves a task to In Progress, now that
  // the composer's Status picker is gone (26 Sept 2026). It posts a one-line
  // update, as the picker did, so the change is on the record with its author.
  const { toast: startToast } = useToast();
  const [starting, beginStart] = useTransition();
  const startWork = () => beginStart(async () => {
    const fd = new FormData();
    fd.set("taskId", String(t.id)); fd.set("code", t.code);
    fd.set("body", "Started work on this."); fd.set("newStatus", "In Progress");
    try { await portalAddUpdate(fd); router.refresh(); } catch { startToast("That didn’t save — try again.", { tone: "warn" }); }
  });
  const waitingOn = t.blockedOnPersonId != null ? t.people.find((p) => p.id === t.blockedOnPersonId)?.name ?? t.blockPeople.find((p) => p.id === t.blockedOnPersonId)?.name ?? "someone" : null;

  const panel = "rounded-[18px] bg-[var(--st-surface)] p-5";

  const actions = (phone: boolean) => !t.closed && (
    <>
      {t.status === "Not Started" && (
        <button type="button" disabled={starting} onClick={startWork}
          className={cn(stBtn.onCard, phone ? "h-10 flex-1 justify-center text-[13px]" : "hidden sm:inline-flex", "disabled:opacity-60")}>
          <Play size={13} />Start
        </button>
      )}
      <button type="button" disabled={inReview} onClick={() => setReviewOpen(true)}
        className={cn(stBtn.onCard, phone ? "h-10 flex-1 justify-center text-[13px]" : "hidden sm:inline-flex", "disabled:opacity-60")}>
        <Send size={13} />{inReview ? "With the reviewer" : "Send for review"}
      </button>
      <button type="button" onClick={() => setBlockOpen(true)}
        className={cn(stBtn.onCardGhost, phone ? "h-10 flex-1 justify-center text-[13px]" : "hidden sm:inline-flex", waitingOn && "border-[#4A2A3C] text-[#F07BBE]")}>
        <PauseCircle size={13} />{waitingOn ? `Waiting on ${getGivenName(waitingOn)}` : "I’m blocked"}
      </button>
      {t.canComplete && (
        <button type="button" onClick={() => setCompleteOpen(true)}
          className={cn(stBtn.onCardGhost, phone ? "h-10 flex-1 justify-center text-[13px]" : "hidden sm:inline-flex")}>
          <CheckCircle2 size={13} />Complete
        </button>
      )}
    </>
  );

  const details = (
    <div className={cn(panel, "min-w-0")}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">Details</span>
        <span className="text-[11px] text-[var(--st-muted)]">set by whoever runs it</span>
      </div>
      <dl className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] gap-x-3 gap-y-2.5 text-[13px]">
        {t.details.map((d) => (
          <div key={d.label} className="contents">
            <dt className="text-[var(--st-muted)]">{d.label}</dt>
            <dd className="m-0 min-w-0 break-words">{d.value}</dd>
          </div>
        ))}
      </dl>
      {t.canEdit && (
        <button type="button" onClick={() => setEditOpen(true)} className={cn(stBtn.ghost, "mt-4 h-8 w-full justify-center text-xs")}><Pencil size={12} />Edit the title and description</button>
      )}
      {t.description && (
        <div className="mt-4 border-t border-[var(--st-line-soft)] pt-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--st-muted)]">About this task</div>
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--st-sub)]">{t.description}</p>
        </div>
      )}
    </div>
  );

  const people = (
    <div className={panel}>
      <div className="mb-3 text-[15px] font-semibold">People</div>
      {t.people.length ? (
        <div className="space-y-2.5">
          {t.people.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5">
              <PersonFace name={p.name} label={p.me ? "You" : undefined} size={32} peek />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{p.me ? "You" : p.name}</span>
                <span className="block text-[11px] text-[var(--st-muted)]">{p.role}</span>
              </span>
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-[var(--st-muted)]">Nobody is on this task yet.</p>}
    </div>
  );

  const subtasks = (withTitle: boolean) => (
    <div className={withTitle ? panel : undefined}>
      <TaskSubtasks taskId={t.id} title={withTitle} onCount={setSub} />
    </div>
  );

  const tabs: { id: typeof tab; label: string; n?: number; only?: string }[] = [
    { id: "conversation", label: "Conversation", n: t.convo.messages.length || undefined },
    { id: "subtasks", label: "Subtasks", n: sub?.total || undefined, only: "md:hidden" },
    { id: "details", label: "Details", only: "md:hidden" },
    { id: "history", label: "History", n: t.history.length || undefined },
  ];

  const centre = (
    <div className={cn(panel, "flex min-w-0 flex-col px-5 pb-5 pt-2 lg:h-full lg:min-h-0")}>
      <div className="mb-4 flex shrink-0 gap-5 overflow-x-auto border-b border-[var(--st-line-soft)] [scrollbar-width:none]" role="tablist" aria-label="Task sections">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
            className={cn("-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[13px] transition-colors", x.only, tab === x.id ? "border-[var(--st-ink)] text-[var(--st-ink)]" : "border-transparent text-[var(--st-muted)] hover:text-[var(--st-ink)]")}>
            {x.label}{x.n != null && <span className="text-xs text-[var(--st-muted)]">{x.id === "subtasks" && sub ? `${sub.done}/${sub.total}` : x.n}</span>}
          </button>
        ))}
      </div>
      {tab === "details" ? <div className="-mx-5 -mt-2 flex flex-col gap-1">{details}{people}</div>
        : tab === "subtasks" ? <div className="st-scroll -mr-3 min-h-0 flex-1 overflow-y-auto pr-3">{subtasks(false)}</div>
        : tab === "history" ? (
          <div className="st-scroll -mr-3 min-h-0 flex-1 overflow-y-auto pr-3">
            {t.history.length === 0 ? <p className="py-8 text-center text-[13px] text-[var(--st-muted)]">No changes recorded yet.</p> : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {t.history.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-[var(--st-line-soft)] px-3 py-2 text-[13px]">
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--st-muted)]" />
                    <span className="min-w-0 flex-1">{h.text}</span>
                    <span className="shrink-0 text-[11px] text-[var(--st-muted)]">{new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <PortalConversation
              variant="studio"
              taskId={t.id}
              code={t.code}
              closed={t.closed}
              statusOptions={t.convo.statusOptions}
              currentStatus={t.status}
              messages={t.convo.messages}
              events={t.convo.events}
              latestId={t.convo.latestId}
              seenLabel={t.convo.seenLabel}
              team={t.convo.team}
              addAction={portalAddUpdate}
              pinAction={portalTogglePin}
              ackAction={portalAcknowledge}
              editAction={portalEditUpdate}
              deleteAction={portalDeleteUpdate}
              canPin={false}
              canAck
              starters={STARTERS}
              composerHint="Finished? Choose Under Review (or “Send for review” above) — whoever runs the task confirms it."
              onPosted={() => router.refresh()}
            />
          </div>
        )}
    </div>
  );

  return (
    <StudioScope className="space-y-4">
      <div className="st-tex-rings flex flex-col gap-3 rounded-[20px] bg-[var(--st-card)] px-5 py-4 text-[var(--st-on-card)]">
        <div className="flex flex-wrap items-center gap-2">
          <BackLink fallbackHref="/portal/tasks" fallbackLabel="Tasks" className={cn(stBtn.onCard, "h-9 sm:h-8")} />
          <span className="st-mono rounded-md bg-[var(--st-card-3)] px-2 py-1 text-[11px] text-[#C9CBCF]">{t.code}</span>
          {t.companyName && <span className="truncate text-[13px] text-[var(--st-on-card-muted)]">{t.companyName}</span>}
          <span className="grow" />
          {actions(false)}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h1 className="m-0 min-w-0 text-[26px] font-medium leading-tight tracking-[-0.03em] sm:text-[36px]">{t.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#1F2023] px-2.5 text-xs text-[#F2F2F0]">
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS_DOT[t.status] ?? "#B9BBBF" }} />{t.status}
            </span>
            {t.deadline && <span className="inline-flex h-7 items-center rounded-lg bg-[#1F2023] px-2.5 text-xs" style={{ color: DUE_ON_CARD[t.deadline.tone] }}>{t.deadline.words}</span>}
            <span className="inline-flex h-7 items-center rounded-lg bg-[#1F2023] px-2.5 text-xs text-[#F2F2F0]">{t.priority} priority</span>
          </div>
        </div>
        {!t.closed && <div className="flex gap-2 sm:hidden">{actions(true)}</div>}
      </div>

      <div ref={grid} className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_260px] lg:grid-cols-[250px_minmax(0,1fr)_240px] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch xl:grid-cols-[290px_minmax(0,1fr)_304px] 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <div className="st-scroll order-2 hidden min-w-0 rounded-[18px] md:block lg:order-1 lg:min-h-0 lg:overflow-y-auto">{details}</div>
        <div className="order-1 min-w-0 md:row-span-2 lg:order-2 lg:row-span-1 lg:min-h-0">{centre}</div>
        <div className="st-scroll order-3 hidden min-w-0 flex-col gap-3.5 md:flex lg:min-h-0 lg:overflow-y-auto">
          {people}
          {subtasks(true)}
        </div>
      </div>

      <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} taskId={t.id} code={t.code} />
      <StudioSheet open={blockOpen} onClose={() => setBlockOpen(false)} title={waitingOn ? "Waiting on someone" : "I’m blocked"} icon={<PauseCircle size={16} />} width={460}>
        {t.blockPeople.length === 0 && !waitingOn ? (
          <p className="text-[13px] text-[var(--st-sub)]">Nobody else is on this task to wait on. Post an update with the status set to Blocked and say who it is waiting on.</p>
        ) : (
          <StudioBlocker portal startOpen taskId={t.id} closed={t.closed} blockedOnPersonId={t.blockedOnPersonId} blockedReason={t.blockedReason}
            people={t.blockPeople} onChanged={() => { setBlockOpen(false); router.refresh(); }} />
        )}
      </StudioSheet>
      {t.canEdit && <EditSheet open={editOpen} onClose={() => setEditOpen(false)} taskId={t.id} title={t.title} description={t.description ?? ""} />}
      <CompleteTaskSheet open={completeOpen} onClose={() => setCompleteOpen(false)} taskId={t.id} code={t.code} requiresAttachment={t.requiresAttachment} />
    </StudioScope>
  );
}

/** Send for review: an update with a note, moving the task to Under Review. */
function ReviewSheet({ open, onClose, taskId, code }: { open: boolean; onClose: () => void; taskId: number; code: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const send = () => {
    const body = note.trim();
    if (!body) return;
    const fd = new FormData();
    fd.set("taskId", String(taskId));
    fd.set("code", code);
    fd.set("body", body);
    fd.set("newStatus", "Under Review");
    start(async () => {
      try {
        await portalAddUpdate(fd);
        toast("Sent for review — whoever runs the task will confirm it.", { tone: "success" });
        setNote("");
        onClose();
        router.refresh();
      } catch {
        toast("That didn’t send — try again.", { tone: "warn" });
      }
    });
  };
  return (
    <StudioSheet open={open} onClose={onClose} title="Send for review" icon={<Send size={15} />} width={480}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={cn(stBtn.ghost, "h-9 text-xs")}>Cancel</button>
          <button type="button" disabled={busy || !note.trim()} onClick={send} className={cn(stBtn.dark, "h-9 text-xs disabled:opacity-50")}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Send for review
          </button>
        </div>
      }>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-[var(--sh-sub,var(--st-sub))]">What did you do? It goes on the task as an update, and the task moves to Under Review.</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} autoFocus
          placeholder="e.g. Reconciled with the TRA filing — the letter is attached above."
          className="bare-field w-full resize-y rounded-xl border border-[var(--sh-chip-line,var(--st-line))] bg-transparent px-3.5 py-2.5 text-[13px] outline-none" />
      </label>
    </StudioSheet>
  );
}

function EditSheet({ open, onClose, taskId, title, description }: { open: boolean; onClose: () => void; taskId: number; title: string; description: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description);
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    if (!name.trim()) { toast("A task needs a title.", { tone: "warn" }); return; }
    // A dropped connection throws — inside this transition that would take the
    // page to its error screen, so it is a toast like any other refusal.
    const res = await portalEditTask({ taskId, actionItem: name.trim(), description: desc.trim() || null })
      .catch((e: unknown) => {
        // Signed out: the action redirects to sign-in by throwing — let it go.
        if (String((e as { digest?: unknown } | null)?.digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
        return { ok: false as const, error: "That didn't save — check the connection and try again." };
      });
    if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
    toast("Task updated.", { tone: "success" });
    onClose();
    router.refresh();
  });
  const field = "bare-field w-full rounded-xl border border-[var(--sh-chip-line,var(--st-line))] bg-transparent px-3.5 py-2.5 text-[13px] outline-none";
  return (
    <StudioSheet open={open} onClose={onClose} title="Edit the task" icon={<Pencil size={15} />} width={520}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={cn(stBtn.ghost, "h-9 text-xs")}>Cancel</button>
          <button type="button" disabled={busy} onClick={save} className={cn(stBtn.dark, "h-9 text-xs disabled:opacity-50")}>{busy && <Loader2 size={13} className="animate-spin" />}Save</button>
        </div>
      }>
      <div className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Title" className={field} />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} aria-label="Description" placeholder="What the task is about" className={cn(field, "resize-y")} />
      </div>
    </StudioSheet>
  );
}
