"use client";

/**
 * The task side panel on the Studio Tasks page. Click a row and it slides in on
 * the right and STAYS PUT however far down the list you have scrolled — the
 * owner's ask (25 Sept 2026): the old answer lived in the right-hand summary
 * card at the TOP of the page, so a row picked further down had its updates
 * somewhere off-screen above him.
 *
 * It is NOT a modal: no backdrop, the list stays live, a click on another row
 * swaps the panel, × / Esc / clicking the same row again lets go. From `xl` up
 * the page makes room for it (`[data-task-panel]` in globals.css) so it never
 * covers a row; below that it floats over the list, and on a phone it is a
 * sheet above the footer.
 *
 * ⚠️ EVERY ACTION HERE IS AN EXISTING ONE. Post = `addTaskUpdate`,
 * Complete/Escalate = `inlineUpdateTask`, Remind = `adminRemindTask`, and the
 * conversation is `/api/task-detail` — the same route the drawer and the cards
 * view read, which also stamps the owner's view, so opening a task here marks
 * its updates read exactly as opening the full task does.
 */
import { TaskSubtasks } from "@/components/studio/subtasks";
import { PersonFace } from "@/components/studio/face";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ArrowUp, Bell, Maximize2, X, ArrowRight, Loader2, Pin, Paperclip } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import type { ConvoMessage } from "@/components/portal-conversation";
import { addTaskUpdate, inlineUpdateTask, adminRemindTask } from "@/app/task/actions";
import { taskHref } from "@/lib/task-href";
import { withReturn, markPush } from "@/lib/return-to";
import { cachedTaskDetail, storeTaskDetail } from "@/lib/task-detail-cache";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { Dot } from "@/components/studio/kit";
import { useStudioPick } from "./pick";
import { STATUS_DOT, deadlineWords, initials, avatarTint, ago } from "./task-words";
import { cn } from "@/lib/cn";

const STARTERS: [string, string][] = [
  ["Still on it", "Still on it — "],
  ["Waiting on", "Waiting on "],
  ["Done, ready to close", "Done, ready to close."],
];

const SMALL_BTN = "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[var(--sh-chip-line)] px-3 text-[13px] sm:h-7 sm:rounded-[8px] sm:px-2.5 sm:text-xs transition-colors hover:bg-[var(--sh-hover)] disabled:opacity-50";

export function TaskPanel({ rows, extra }: { rows: TaskRow[]; extra: TaskRow[] }) {
  const pick = useStudioPick();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const task = pick?.code ? rows.find((r) => r.code === pick.code) ?? extra.find((r) => r.code === pick.code) ?? null : null;
  if (!mounted || !task) return null;
  return createPortal(<Panel key={task.code} task={task} rows={rows} onClose={() => pick?.setCode(null)} />, document.body);
}

function Panel({ task, rows, onClose }: { task: TaskRow; rows: TaskRow[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  // Drawn from the copy in memory first (a hovered row was read ahead), then
  // the fresh read replaces it.
  const [msgs, setMsgs] = useState<ConvoMessage[] | null>(() => {
    const hit = cachedTaskDetail<{ convoMessages: ConvoMessage[] }>(task.code);
    return hit ? [...hit.convoMessages].reverse() : null;
  });
  // "Open the whole task": the panel grows to fill the frame, THEN the page
  // changes — so opening reads as this panel becoming the task, not a jump.
  const [expanding, setExpanding] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const due = deadlineWords(task);
  const open = task.status !== "Completed" && task.status !== "Closed";

  // The conversation. Reading it stamps the owner's view, so an unread task
  // stops being unread — refresh once so the row's dot and the card's count
  // agree with what he has just read.
  const wasUnread = useRef(task.unread);
  useEffect(() => {
    let live = true;
    fetch(`/api/task-detail?code=${encodeURIComponent(task.code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { convoMessages: ConvoMessage[] }) => {
        // The record page reads the same route: keep the copy, and "open the
        // whole task" draws at once instead of saying "Loading…".
        storeTaskDetail(task.code, d);
        if (!live) return;
        setMsgs([...d.convoMessages].reverse()); // oldest first, newest at the foot
        if (wasUnread.current) { wasUnread.current = false; router.refresh(); }
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [task.code, nonce, router]);

  // Newest at the foot, in view — the way every conversation reads.
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  const expandHref = withReturn(taskHref(task.code, { list: rows.map((r) => r.code) }), `${window.location.pathname}${window.location.search}`);
  // Ask for the page now, while he reads — so the grow ends on a page that is
  // already here.
  useEffect(() => { router.prefetch(expandHref); }, [router, expandHref]);

  // Below lg the panel is a sheet over the list: scrolling inside it must not
  // move the page behind (owner, 26 Sept 2026). Lock the document while it is
  // open; on a desk it is a column BESIDE the list, and the list stays live.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = was; };
  }, []);

  function expand() {
    if (expanding) return;
    markPush(expandHref);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    if (reduced) { router.push(expandHref); return; }
    setExpanding(true);
    window.setTimeout(() => router.push(expandHref), 240);
  }

  function post() {
    const body = draft.trim();
    if (!body) return;
    start(async () => {
      try {
        await addTaskUpdate(task.id, task.code, body);
        setDraft("");
        setNonce((n) => n + 1);
        router.refresh();
      } catch (e) {
        // Not the thrown message — in production that is Next's generic
        // "An error occurred…". The draft stays in the box.
        void e;
        toast("Couldn't post the update — your words are still in the box.", { tone: "warn" });
      }
    });
  }

  async function act(kind: "complete" | "escalate") {
    setBusy(kind);
    // A dropped connection throws — without the catch the button spun for ever.
    const res = await inlineUpdateTask(task.code, kind === "complete" ? "status" : "escalation", kind === "complete" ? "Completed" : "Yes")
      .catch(() => ({ ok: false as const, error: "That didn't go through — check the connection and try again.", undoToken: undefined }));
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
    const res = await adminRemindTask(task.id).catch(() => ({ ok: false as const, error: "That didn't go through — check the connection and try again." }));
    setBusy(null);
    if (!res.ok) return toast(res.error, { tone: "warn" });
    if (res.link) window.open(res.link, "_blank");
    toast(res.contactMissing ? `${res.name} has no contact details on file.` : `Reminder ready for ${res.name}.`, { tone: res.contactMissing ? "warn" : "success" });
  }

  return (
    <aside
      data-task-panel
      data-expanding={expanding || undefined}
      aria-label={`${task.code} — updates`}
      className={cn(
        "studio st-sheet st-panel-in fixed z-[45] flex flex-col overflow-hidden rounded-3xl border border-[var(--sh-line)] shadow-[0_24px_60px_rgba(17,18,20,0.18)]",
        // Phone and tablet: a sheet above the footer. Desktop: a column on the right.
        "inset-x-2 bottom-[calc(var(--foot-h)+var(--foot-safe)+8px)] max-h-[72dvh]",
        "lg:inset-x-auto lg:right-4 lg:top-4 lg:max-h-none lg:w-[400px]",
        // Growing into the full task: the panel takes the whole frame and its
        // contents step back, then the page arrives in its place.
        "transition-[width,right,top,max-height,border-radius] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        expanding && "st-panel-grow",
      )}
    >
      {/* who and what */}
      <div className="flex flex-col gap-2.5 border-b border-[var(--sh-line)] px-5 pb-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="st-mono rounded-md bg-[var(--sh-hover)] px-1.5 py-0.5 text-[11px] text-[var(--sh-sub)]">{task.code}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--sh-muted)]">{task.companyName}</span>
          <Link
            href={expandHref}
            onClick={(e) => {
              // A new tab / window keeps the browser's own behaviour.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              expand();
            }}
            aria-label="Open the whole task"
            title="Open the whole task"
            className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)] transition-opacity hover:opacity-90 sm:h-8 sm:w-8"
          >
            <Maximize2 size={13} />
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[var(--sh-chip-line)] text-[var(--sh-sub)] transition-colors hover:text-[var(--sh-fg)] sm:h-8 sm:w-8">
            <X size={13} />
          </button>
        </div>

        <div className="line-clamp-2 text-[19px] font-medium leading-[1.25] tracking-[-0.015em]">{task.actionItem}</div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-[7px] bg-[var(--sh-hover)] px-2"><Dot color={STATUS_DOT[task.status] ?? "#B9BBBF"} />{task.status}</span>
          <span className="inline-flex h-6 items-center rounded-[7px] bg-[var(--sh-hover)] px-2" style={{ color: due.onPage }}>{due.words}</span>
          {task.escalation === "Yes" && <span className="inline-flex h-6 items-center rounded-[7px] bg-[var(--sh-pink-bg)] px-2 text-[var(--sh-pink-fg)]">Escalated</span>}
        </div>

        <div className="flex items-center gap-2">
          <span className="flex">
            {task.assignees.slice(0, 4).map((n, i) => (
              <span key={n + i} className="flex rounded-full border-2 border-[var(--sh-bg)]" style={{ marginLeft: i ? -6 : 0 }}><PersonFace name={n} size={18} peek /></span>
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--sh-sub)]">{task.assignees.join(", ") || "Nobody assigned"}</span>
        </div>

        {open && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={!!busy} onClick={() => act("complete")} className={cn(SMALL_BTN, "border-transparent bg-[var(--sh-on-bg)] font-semibold text-[var(--sh-on-fg)] hover:bg-[var(--sh-on-bg)] hover:opacity-90")}>
              {busy === "complete" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.6} />}Complete
            </button>
            {task.escalation !== "Yes" && (
              <button type="button" disabled={!!busy} onClick={() => act("escalate")} className={SMALL_BTN}>
                {busy === "escalate" ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={12} />}Escalate
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={remind} className={SMALL_BTN}>
              {busy === "remind" ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}Remind
            </button>
          </div>
        )}
      </div>

      {/* Subtasks — tick, add, rename, delete without leaving the list. */}
      <div className="st-scroll max-h-[34vh] shrink-0 overflow-y-auto overscroll-contain border-b border-[var(--sh-line)] px-3 py-3">
        <TaskSubtasks key={task.id} taskId={task.id} tone="sheet" />
      </div>

      {/* the conversation */}
      <div ref={scroller} className="st-scroll flex min-h-[120px] flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-5 py-4">
        {msgs == null && !failed && <div className="flex flex-1 items-center justify-center"><Loader2 size={16} className="animate-spin text-[var(--sh-muted)]" /></div>}
        {failed && <div className="text-[13px] text-[var(--sh-muted)]">Couldn&apos;t load the updates — open the whole task to read them.</div>}
        {msgs && msgs.length === 0 && <div className="m-auto max-w-[260px] text-center text-[13px] text-[var(--sh-muted)]">No updates yet — the first one you post tells everyone on the task.</div>}
        {msgs?.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <PersonFace name={!m.authorName || m.authorName === "You" ? "Administrator" : m.authorName} label={m.me ? "You" : undefined} size={24} peek className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--sh-muted)]">
                <span className="font-medium text-[var(--sh-sub)]">{m.me ? "You" : m.authorName}</span>· {ago(m.at)}
                {m.pinned && <Pin size={10} className="text-[var(--sh-sub)]" aria-label="Pinned" />}
              </div>
              {m.parent && <div className="mt-1 truncate border-l-2 border-[var(--sh-line)] pl-2 text-[11px] text-[var(--sh-muted)]">{m.parent.authorName}: {m.parent.snippet}</div>}
              <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[1.45]">{m.body}</div>
              {m.attachment && <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--sh-sub)]"><Paperclip size={11} />{m.attachment.name}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* reply */}
      <div className="border-t border-[var(--sh-line)] px-4 pb-4 pt-3">
        {open ? (
          <form onSubmit={(e) => { e.preventDefault(); post(); }} className="flex flex-col gap-2">
            <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
              {STARTERS.map(([label, text]) => (
                <button key={label} type="button" onClick={() => setDraft(text)} className="h-9 shrink-0 whitespace-nowrap rounded-[9px] border border-[var(--sh-chip-line)] px-3 text-xs text-[var(--sh-sub)] sm:h-[26px] sm:rounded-[7px] sm:px-2 sm:text-[11px] transition-colors hover:bg-[var(--sh-hover)]">{label}</button>
              ))}
            </div>
            <div className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--sh-field-line)] bg-[var(--sh-field)] pl-3 pr-1">
              <label className="flex min-w-0 flex-1">
                <span className="sr-only">Post an update on {task.code}</span>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Post an update…"
                  className="bare-field w-full border-0 bg-transparent text-[13px] text-[var(--sh-fg)] outline-none placeholder:text-[var(--sh-muted)]"
                />
              </label>
              <button type="submit" disabled={pending || !draft.trim()} className="inline-flex h-10 items-center gap-1 rounded-lg bg-[var(--sh-on-bg)] px-4 text-[13px] font-semibold sm:h-[30px] sm:px-3 sm:text-xs text-[var(--sh-on-fg)] transition-opacity disabled:opacity-40">
                {pending ? <Loader2 size={12} className="animate-spin" /> : null}Post<ArrowRight size={12} />
              </button>
            </div>
          </form>
        ) : (
          <div className="text-xs text-[var(--sh-muted)]">This task is {task.status.toLowerCase()} — reopen it from the whole task to post again.</div>
        )}
      </div>
    </aside>
  );
}
