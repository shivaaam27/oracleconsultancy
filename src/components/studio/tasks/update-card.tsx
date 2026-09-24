"use client";

/**
 * The right-hand summary card on the Studio Tasks page.
 *
 * Nothing picked → how many updates you haven't read, and the freshest three.
 * A task picked   → its latest update, one-tap actions, and a box to post a
 *                   new update without leaving the list. ↗ opens the full task.
 *
 * ⚠️ EVERY ACTION HERE IS AN EXISTING ONE. Post = `addTaskUpdate` (the list's
 * QuickUpdate uses it), Complete/Escalate = `inlineUpdateTask` (the row menu and
 * the peek use it), Remind = `adminRemindTask`. No new way of writing a task.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ArrowUp, Bell, Maximize2, X, ArrowRight, Loader2 } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { addTaskUpdate, inlineUpdateTask, adminRemindTask } from "@/app/task/actions";
import { taskHref } from "@/lib/task-href";
import { withReturn, markPush } from "@/lib/return-to";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { CardHead, Dot, stBtn } from "@/components/studio/kit";
import { useStudioPick } from "./pick";
import { STATUS_DOT, deadlineWords, initials, avatarTint, ago, statusTarget } from "./task-words";
import { cn } from "@/lib/cn";

const STARTERS: [string, string][] = [
  ["Still on it", "Still on it — "],
  ["Waiting on", "Waiting on "],
  ["Done, ready to close", "Done, ready to close."],
];

export function UpdateCard({
  rows,
  fresh,
  unreadCount,
  postedToday,
}: {
  /** The rows on screen — a picked task is looked up here. */
  rows: TaskRow[];
  /** The newest updates across the open tasks, newest first (up to 3). */
  fresh: TaskRow[];
  unreadCount: number;
  postedToday: number;
}) {
  const pick = useStudioPick();
  const picked = pick?.code ? rows.find((r) => r.code === pick.code) ?? fresh.find((r) => r.code === pick.code) ?? null : null;
  return (
    <div
      className={cn(
        "relative flex min-h-[244px] min-w-0 flex-col overflow-hidden rounded-[20px] bg-[var(--st-card)] px-6 py-5 text-[var(--st-on-card)]",
        !picked && "st-tex-rings",
      )}
    >
      {picked ? <Picked key={picked.code} task={picked} rows={rows} onClose={() => pick?.setCode(null)} /> : (
        <Idle fresh={fresh} unreadCount={unreadCount} postedToday={postedToday} onPick={(c) => pick?.setCode(c)} />
      )}
    </div>
  );
}

function Idle({ fresh, unreadCount, postedToday, onPick }: { fresh: TaskRow[]; unreadCount: number; postedToday: number; onPick: (code: string) => void }) {
  return (
    <div className="st-pop flex h-full flex-1 flex-col">
      <CardHead label="Updates" right={<span>Pick a task to read and reply here</span>} />
      <div className="mt-3 grid flex-1 grid-cols-1 items-end gap-5 sm:grid-cols-[170px_minmax(0,1fr)]">
        <div>
          <div className="text-[76px] leading-[0.85] tracking-[-0.045em] tabular-nums">{unreadCount}</div>
          <div className="mt-2.5 text-[13px] text-[#C9CBCF]">unread {unreadCount === 1 ? "update" : "updates"}</div>
          <div className="mt-0.5 text-xs text-[var(--st-muted)]">{postedToday === 0 ? "No task updated yet today" : `${postedToday} ${postedToday === 1 ? "task" : "tasks"} updated today`}</div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          {fresh.length === 0 && <div className="text-[13px] text-[var(--st-muted)]">No updates yet on the open tasks.</div>}
          {fresh.map((r) => {
            const a = r.latestActivity!;
            return (
              <button
                key={r.code}
                type="button"
                onClick={() => onPick(r.code)}
                className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-[var(--st-card-line)] bg-[rgba(20,21,23,0.85)] px-2.5 py-2 text-left transition-colors hover:border-[#3A3D42]"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-[#111214]" style={{ background: a.author === "You" ? "#F2F2F0" : avatarTint(a.author) }}>{a.author === "You" ? "You" : initials(a.author)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs text-[var(--st-on-card-muted)]">{r.actionItem}</span>
                  <span className="block truncate text-[13px]">{a.body}</span>
                </span>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[var(--st-muted)]">
                  {r.unread && <Dot color="var(--st-blue)" size={6} />}
                  {ago(a.atISO)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Picked({ task, rows, onClose }: { task: TaskRow; rows: TaskRow[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const a = task.latestActivity;
  const due = deadlineWords(task);
  const open = task.status !== "Completed" && task.status !== "Closed";

  // A fresh pick starts with an empty box.
  useEffect(() => { setDraft(""); }, [task.code]);

  const expandHref = typeof window === "undefined"
    ? taskHref(task.code)
    : withReturn(taskHref(task.code, { list: rows.map((r) => r.code) }), `${window.location.pathname}${window.location.search}`);

  function post() {
    const body = draft.trim();
    if (!body) return;
    start(async () => {
      try {
        await addTaskUpdate(task.id, task.code, body);
        setDraft("");
        toast(`Update posted on ${task.code}`, { tone: "success" });
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't post the update.", { tone: "warn" });
      }
    });
  }

  async function act(kind: "complete" | "escalate") {
    setBusy(kind);
    const res = await inlineUpdateTask(task.code, kind === "complete" ? "status" : "escalation", kind === "complete" ? "Completed" : "Yes");
    setBusy(null);
    if (!res.ok) return toast(res.error ?? "That didn't work.", { tone: "warn" });
    toast(`${task.code} ${kind === "complete" ? "completed" : "escalated"}`, {
      tone: "success",
      duration: 6000,
      action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined,
    });
    router.refresh();
  }

  async function remind() {
    setBusy("remind");
    const res = await adminRemindTask(task.id);
    setBusy(null);
    if (!res.ok) return toast(res.error, { tone: "warn" });
    if (res.link) window.open(res.link, "_blank");
    toast(res.contactMissing ? `${res.name} has no contact details on file.` : `Reminder ready for ${res.name}.`, { tone: res.contactMissing ? "warn" : "success" });
  }

  return (
    <div className="st-pop flex h-full flex-1 flex-col gap-2.5">
      <div className="flex h-[26px] items-center gap-2">
        <span className="st-mono rounded-md bg-[var(--st-card-3)] px-1.5 py-0.5 text-[11px] text-[#C9CBCF]">{task.code}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--st-on-card-muted)]">{task.companyName}</span>
        <Link
          href={expandHref}
          onClick={(e) => markPush(e.currentTarget.getAttribute("href") ?? "")}
          aria-label="Open the whole task"
          title="Open the whole task"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--st-on-card)] text-[#111214] transition-opacity hover:opacity-90"
        >
          <Maximize2 size={13} />
        </Link>
        <button type="button" onClick={onClose} aria-label="Close the preview" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--st-card-line)] text-[#C9CBCF] transition-colors hover:bg-[var(--st-card-2)]">
          <X size={12} />
        </button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-0 truncate text-2xl font-medium tracking-[-0.02em]">{task.actionItem}</div>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[7px] bg-[var(--st-card-3)] px-2 text-xs"><Dot color={STATUS_DOT[task.status] ?? "#B9BBBF"} />{task.status}</span>
        <span className="inline-flex h-6 shrink-0 items-center rounded-[7px] bg-[var(--st-card-3)] px-2 text-xs" style={{ color: due.onCard }}>{due.words}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex">
          {task.assignees.slice(0, 4).map((n, i) => (
            <span key={n + i} title={n} className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--st-card)] text-[8px] font-semibold text-[#111214]" style={{ background: avatarTint(n), marginLeft: i ? -6 : 0 }}>{initials(n)}</span>
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--st-on-card-muted)]">{task.assignees.join(", ") || "Nobody assigned"}</span>
        {open && (
          <>
            <button type="button" disabled={!!busy} onClick={() => act("complete")} className={cn(stBtn.onCard, "h-[26px] px-2.5 text-[11px]")}>
              {busy === "complete" ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={2.6} />}Complete
            </button>
            {task.escalation !== "Yes" && (
              <button type="button" disabled={!!busy} onClick={() => act("escalate")} className={cn(stBtn.onCardGhost, "h-[26px] px-2.5 text-[11px]")}>
                {busy === "escalate" ? <Loader2 size={11} className="animate-spin" /> : <ArrowUp size={11} />}Escalate
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={remind} className={cn(stBtn.onCardGhost, "h-[26px] px-2.5 text-[11px]")}>
              {busy === "remind" ? <Loader2 size={11} className="animate-spin" /> : <Bell size={11} />}Remind
            </button>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-1">
        {a ? (
          <>
            <div className="text-[11px] text-[var(--st-muted)]">
              {a.author} · {ago(a.atISO)}
              {task.updateCount > 1 && <span className="text-[#6E7177]"> · {task.updateCount - 1} earlier — open the task to read them</span>}
            </div>
            <div className="line-clamp-2 text-sm leading-[1.45] text-[#E6E6E3]">{a.kind === "status" ? `Moved to ${statusTarget(a.body) ?? "a new status"}` : a.body}</div>
          </>
        ) : (
          <div className="text-[13px] text-[var(--st-muted)]">No updates yet — the first one you post tells everyone on the task.</div>
        )}
      </div>

      {open ? (
        <form
          onSubmit={(e) => { e.preventDefault(); post(); }}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--st-card-line)] bg-[var(--st-card-3)] pl-3 pr-1"
        >
          <label className="flex min-w-0 flex-1">
            <span className="sr-only">Post an update on {task.code}</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Post an update…"
              className="bare-field w-full border-0 bg-transparent text-[13px] text-[var(--st-on-card)] outline-none placeholder:text-[var(--st-muted)]"
            />
          </label>
          <span className="hidden gap-1 xl:flex">
            {STARTERS.map(([label, text]) => (
              <button key={label} type="button" onClick={() => setDraft(text)} className="h-[26px] whitespace-nowrap rounded-[7px] border border-[#34363B] px-2 text-[11px] text-[#C9CBCF] transition-colors hover:bg-[var(--st-card-2)]">{label}</button>
            ))}
          </span>
          <button type="submit" disabled={pending || !draft.trim()} className="inline-flex h-[30px] items-center gap-1 rounded-lg bg-[var(--st-on-card)] px-3 text-xs font-semibold text-[#111214] transition-opacity disabled:opacity-40">
            {pending ? <Loader2 size={12} className="animate-spin" /> : null}Post<ArrowRight size={12} />
          </button>
        </form>
      ) : (
        <div className="text-xs text-[var(--st-muted)]">This task is {task.status.toLowerCase()} — reopen it from the full task to post again.</div>
      )}
    </div>
  );
}
