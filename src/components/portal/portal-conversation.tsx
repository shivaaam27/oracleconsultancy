"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, ChevronDown, CornerUpLeft, History, MessageSquare, Paperclip, Pencil, Pin, PinOff, Send, Trash2, X } from "lucide-react";
import { segmentMentions, type MentionCandidate } from "@/lib/tasks/mentions";
import { CaretTextarea } from "../ui";
import { VoiceButton } from "../forms/voice-button";
import { useToast } from "../shell/toast";

/* Shared conversation view for a task — used by BOTH the staff portal and the
 * admin control centre. Chat-style messages with replies, @mentions, file
 * attachments, voice dictation, inline system-event markers, and a pinned
 * instruction banner. The server precomputes display fields; the page injects
 * its own server actions + capability flags, so the same component serves the
 * limited staff view and the full-powered admin view. */

type ServerAction = (formData: FormData) => void | Promise<void>;

/** A redirect / not-found thrown by a server action is navigation, not a
 *  failure — it must travel on (a signed-out portal post goes to sign-in). */
function isNavigation(e: unknown): boolean {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_NOT_FOUND") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

export type ConvoMessage = {
  id: number;
  body: string;
  at: string; // ISO
  authorName: string;
  management: boolean;
  me: boolean;
  pinned: boolean;
  parent: { authorName: string; snippet: string } | null;
  ackNames: string[];
  iAcked: boolean;
  attachment: { name: string } | null;
};

/** A thin inline system marker (status/deadline change, escalation, …). */
export type ConvoEvent = {
  id: string;
  at: string; // ISO
  text: string;
  /** Who made the change, when known ("You", "Administrator", a name). */
  by?: string;
};

type Props = {
  taskId: number;
  code: string;
  closed: boolean;
  statusOptions: string[];
  currentStatus: string;
  messages: ConvoMessage[]; // newest first
  events: ConvoEvent[]; // system markers, interleaved by time
  latestId: number | null;
  seenLabel: string[];
  team: MentionCandidate[]; // for @mention autocomplete + highlighting
  // Injected server actions (portal or admin variants).
  addAction: ServerAction;
  pinAction: ServerAction;
  ackAction?: ServerAction;
  /** Edit / soft-delete an update. When present, an author (m.me) — or a
   *  moderator (canModerate) — gets inline edit + delete controls per message. */
  editAction?: ServerAction;
  deleteAction?: ServerAction;
  // Capabilities.
  canPin: boolean; // show pin/unpin controls
  canAck: boolean; // show the "Understood" button (staff/managers, not admin)
  /** Director/HR — may edit + delete ANY update (not only their own). */
  canModerate?: boolean;
  composerHint?: string;
  /** Fired after an add/pin action resolves — the admin drawer uses it to refetch
   *  exactly on completion instead of guessing with a fixed timer. */
  onPosted?: () => void;
  /** "studio" = the Studio record (design/studio-mockup, Expanded board): chat
   *  bubbles in time order, the writing box at the FOOT with starter phrases.
   *  Same actions, same capabilities — only the layout differs. The staff
   *  portal never passes it, so it is untouched. */
  variant?: "studio";
  /** The studio composer's starter phrases — staff finish with "ready for
   *  review", since only whoever runs the task closes it. */
  starters?: [string, string][];
};

const STARTERS: [string, string][] = [
  ["Still on it", "Still on it — "],
  ["Waiting on", "Waiting on "],
  ["Done, ready to close", "Done, ready to close. "],
  ["Need your decision on", "Need your decision on "],
];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "@partial name" just before the caret: letters, digits, spaces, dots,
 *  hyphens and apostrophes (names like "Mr J. Smith-Jones"), up to 40. */
const MENTION_TAIL = /@([\p{L}\p{N}'.\- ]{0,40})$/u;

/** A post that is only a file ("📎 name" + the file) shows the file once. */
function fileOnly(m: ConvoMessage): boolean {
  return !!m.attachment && m.body.trim() === `📎 ${m.attachment.name}`;
}

/** One quiet line for a run of changes: "Stage → In Progress · Deadline →
 *  30 Sept +1"; on a phone just "3 changes". Tap to see each, with who and when. */
function ChangeLine({ es, studio = false }: { es: ConvoEvent[]; studio?: boolean }) {
  const [open, setOpen] = useState(false);
  const list = [...es].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const nice = (t: string) => t.replace(/^Status → /, "Stage → ");
  const lastAt = list[list.length - 1].at;
  const more = list.length > 1 || list.some((e) => e.by);
  const summary = list.length === 1 ? nice(list[0].text) : `${nice(list[0].text)} · ${nice(list[1].text)}${list.length > 2 ? ` +${list.length - 2}` : ""}`;
  const muted = studio ? "text-[var(--st-muted)]" : "text-fg-subtle";
  return (
    <div className={`flex flex-col items-center gap-1 py-0.5 text-[11px] ${muted}`}>
      <button type="button" disabled={!more} onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 ${studio ? "hover:bg-[var(--st-page)]" : "hover:bg-bg-subtle"} disabled:cursor-default disabled:hover:bg-transparent`}>
        <History size={11} className="shrink-0" />
        {list.length > 1 ? (
          <>
            <span className="truncate sm:hidden">{list.length} changes</span>
            <span className="hidden truncate sm:inline">{summary}</span>
          </>
        ) : <span className="truncate">{summary}</span>}
        <span className="shrink-0">· {time(lastAt)}</span>
        {more && <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <ul className={`w-full max-w-[420px] space-y-1 rounded-xl px-3 py-2 text-left ${studio ? "bg-[var(--st-page)]" : "bg-bg-subtle"}`}>
          {list.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate">{nice(e.text)}</span>
              <span className="shrink-0">{e.by ? `${e.by} · ` : ""}{time(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function PortalConversation(props: Props) {
  const {
    taskId, code, closed, statusOptions, messages, events, latestId, seenLabel, team,
    addAction, pinAction, ackAction, editAction, deleteAction, canPin, canAck, canModerate, composerHint, onPosted,
    variant, starters = STARTERS,
  } = props;
  // Which message is being edited / confirming deletion (moderation controls).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // If a caller wants to know exactly when a post/pin finished (the admin task
  // drawer, to refetch), wrap the server action to fire onPosted after it resolves.
  /* ⚠️ A server action that throws inside a <form action> takes the whole
   * page down to its error screen — and the box had already been emptied, so
   * what was typed was gone too. Each is wrapped: a failure is a toast, and a
   * post that did not go through puts its words back in the box. */
  const { toast } = useToast();
  const guard = (run: ServerAction, failed: string, restore = false): ServerAction => async (fd) => {
    try {
      await run(fd);
    } catch (e) {
      if (isNavigation(e)) throw e;
      if (restore) {
        const body = String(fd.get("body") ?? "");
        // The box is emptied a tick after submit; put the words back after that.
        setTimeout(() => { if (taRef.current && !taRef.current.value) taRef.current.value = body; }, 0);
      }
      // Never the thrown message: in production it is Next's "An error occurred
      // in the Server Components render…", which means nothing to anyone.
      toast(failed, { tone: "warn" });
      return;
    }
    onPosted?.();
  };
  const runAdd = guard(addAction, "Couldn't post the update — your words are back in the box.", true);
  const runPin = guard(pinAction, "Couldn't change the pin — try again.");
  const runEdit = editAction ? guard(editAction, "Couldn't save the change — try again.") : undefined;
  const runDelete = deleteAction ? guard(deleteAction, "Couldn't take the update down — try again.") : undefined;
  const [replyTo, setReplyTo] = useState<{ id: number; author: string; snippet: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Studio: the thread scrolls inside itself, newest at the foot — open it
  // at the newest, and follow a new post down.
  const threadRef = useRef<HTMLElement>(null);
  const newest = messages[0]?.id ?? 0;
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest, events.length]);
  const fileRef = useRef<HTMLInputElement>(null);

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setFileName(null);
  }

  function appendDictation(text: string) {
    const el = taRef.current;
    if (!el) return;
    const sep = el.value && !el.value.endsWith(" ") ? " " : "";
    el.value = el.value + sep + text;
    el.focus();
  }

  // @mention autocomplete: when the caret is in an "@partial" token, show
  // matching team members; clicking one completes "@Full Name ".
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionMatches =
    mentionQuery === null
      ? []
      : team.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);
  const [mentionIndex, setMentionIndex] = useState(0);
  // Arrow keys move through the names, Enter or Tab takes one, Escape closes.
  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionMatches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)].name); }
    else if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); }
  }

  function onComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = MENTION_TAIL.exec(upto);
    setMentionQuery(m ? m[1] : null);
    setMentionIndex(0);
  }

  function pickMention(name: string) {
    const el = taRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret).replace(MENTION_TAIL, `@${name} `);
    const after = el.value.slice(caret);
    el.value = before + after;
    const pos = before.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    setMentionQuery(null);
  }

  const pinned = messages.filter((m) => m.pinned);
  const rest = messages.filter((m) => !m.pinned);

  // Merge messages + changes into one stream, newest first — quietly
  // (owner, 26 Sept 2026: "so many things happen ... it clutters the
  // conversation"). A stage change made with a message rides on that message
  // as a small tag; a run of changes with no message between becomes ONE line.
  type Item = { kind: "msg"; at: string; m: ConvoMessage } | { kind: "events"; at: string; es: ConvoEvent[] };
  const stageTag = new Map<number, string>();
  const folded = new Set<string>();
  for (const e of events) {
    if (!e.text.startsWith("Status → ")) continue;
    const t = new Date(e.at).getTime();
    const m = rest.find((x) => Math.abs(new Date(x.at).getTime() - t) <= 3 * 60_000 && !stageTag.has(x.id));
    if (m) { stageTag.set(m.id, e.text.slice(9)); folded.add(e.id); }
  }
  const stream = [
    ...rest.map((m) => ({ kind: "msg" as const, at: m.at, m })),
    ...events.filter((e) => !folded.has(e.id)).map((e) => ({ kind: "event" as const, at: e.at, e })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const merged: Item[] = [];
  for (const it of stream) {
    const last = merged[merged.length - 1];
    if (it.kind === "msg") merged.push(it);
    else if (last?.kind === "events" && dayLabel(last.at) === dayLabel(it.at)) last.es.push(it.e);
    else merged.push({ kind: "events", at: it.at, es: [it.e] });
  }

  // Group by day (newest first).
  const groups: Array<{ label: string; items: Item[] }> = [];
  for (const it of merged) {
    const label = dayLabel(it.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }

  function startReply(m: ConvoMessage) {
    setReplyTo({ id: m.id, author: m.authorName, snippet: m.body.slice(0, 80) });
    taRef.current?.focus();
    taRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const AckRow = ({ m }: { m: ConvoMessage }) => (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
      {canAck && ackAction && m.iAcked && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
          <CheckCheck size={12} /> You confirmed you&apos;ve read this
        </span>
      )}
      {canAck && ackAction && !m.iAcked && (
        <form action={ackAction}>
          <input type="hidden" name="updateId" value={m.id} />
          <input type="hidden" name="code" value={code} />
          <button
            type="submit"
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent text-accent-fg px-2.5 text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Check size={12} /> Understood
          </button>
        </form>
      )}
      {m.ackNames.length > 0 && <span className="text-xs text-fg-subtle">Read by {m.ackNames.join(", ")}</span>}
      {canAck === false && m.ackNames.length === 0 && (
        <span className="text-xs text-fg-subtle">Not yet acknowledged</span>
      )}
    </div>
  );

  const renderItem = (it: Item) =>
    it.kind === "msg" ? <Bubble key={`m${it.m.id}`} m={it.m} /> : <ChangeLine key={it.es[0].id} es={it.es} />;

  const Bubble = ({ m }: { m: ConvoMessage }) => (
    <div
      className={`group rounded-2xl p-3 ring-1 ${
        m.management ? "bg-accent-soft/50 ring-accent/20" : "bg-bg-subtle/60 ring-border"
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className={`font-semibold ${m.management ? "text-accent" : m.me ? "text-fg" : "text-fg-muted"}`}>
          {m.authorName}
        </span>
        {stageTag.has(m.id) && <span className="rounded bg-bg-subtle px-1.5 py-px text-[11px] text-fg-muted ring-1 ring-border">→ {stageTag.get(m.id)}</span>}
        <span className="grow" />
        {!closed && (
          <button
            type="button"
            onClick={() => startReply(m)}
            title="Reply"
            className="text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-accent transition-all"
          >
            <CornerUpLeft size={13} />
          </button>
        )}
        {canPin && (
          <form action={runPin} className="flex">
            <input type="hidden" name="updateId" value={m.id} />
            <input type="hidden" name="code" value={code} />
            <button type="submit" title={m.pinned ? "Unpin" : "Pin as the current instruction"} className="text-fg-subtle hover:text-accent transition-colors">
              {m.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </form>
        )}
        {!closed && editAction && (m.me || canModerate) && editingId !== m.id && (
          <button type="button" onClick={() => { setEditingId(m.id); setDeletingId(null); }} title="Edit this note" className="text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-accent transition-all">
            <Pencil size={13} />
          </button>
        )}
        {!closed && deleteAction && (m.me || canModerate) && (
          <button type="button" onClick={() => { setDeletingId(deletingId === m.id ? null : m.id); setEditingId(null); }} title="Delete this note" className="text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-danger transition-all">
            <Trash2 size={13} />
          </button>
        )}
        <span className="text-fg-subtle">{time(m.at)}</span>
      </div>

      {m.parent && (
        <div className="mt-1.5 rounded-lg border-l-2 border-accent/40 bg-bg-subtle/50 px-2 py-1 text-xs text-fg-muted">
          <span className="font-medium text-fg-subtle">↪ {m.parent.authorName}: </span>
          <span className="italic">{m.parent.snippet}{m.parent.snippet.length >= 80 ? "…" : ""}</span>
        </div>
      )}

      {editingId === m.id && editAction ? (
        <form action={runEdit} onSubmit={() => setTimeout(() => setEditingId(null), 0)} className="mt-1.5 flex flex-col gap-2">
          <input type="hidden" name="updateId" value={m.id} />
          <input type="hidden" name="code" value={code} />
          <textarea name="body" defaultValue={m.body} rows={2} required className="w-full resize-y rounded-xl bg-bg-elev px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <div className="flex items-center gap-2">
            <button type="submit" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-fg hover:opacity-90 transition-opacity"><Check size={12} /> Save</button>
            <button type="button" onClick={() => setEditingId(null)} className="inline-flex h-7 items-center rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
          </div>
        </form>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
          {segmentMentions(m.body, team).map((seg, i) =>
            seg.mention ? (
              <span key={i} className="rounded bg-accent-soft px-0.5 font-medium text-accent">{seg.text}</span>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
        </p>
      )}

      {deletingId === m.id && deleteAction && (
        <form action={runDelete} onSubmit={() => setTimeout(() => setDeletingId(null), 0)} className="mt-2 flex items-center gap-2 rounded-lg bg-danger-soft/40 px-2.5 py-1.5 text-sm ring-1 ring-danger/20">
          <input type="hidden" name="updateId" value={m.id} />
          <input type="hidden" name="code" value={code} />
          <span className="text-fg-muted">Delete this note?</span>
          <span className="grow" />
          <button type="submit" className="inline-flex h-6 items-center gap-1 rounded bg-danger px-2 text-xs font-medium text-white hover:opacity-90"><Trash2 size={11} /> Delete</button>
          <button type="button" onClick={() => setDeletingId(null)} className="inline-flex h-6 items-center rounded px-1.5 text-xs text-fg-muted hover:text-fg">Keep</button>
        </form>
      )}

      {m.attachment && (
        <a
          href={`/api/portal/attachment?updateId=${m.id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex h-7 items-center gap-2 rounded-md bg-bg-elev ring-1 ring-border px-2.5 text-xs hover:ring-accent/40 transition-colors"
        >
          <Paperclip size={14} className="text-accent shrink-0" />
          <span className="truncate max-w-[16rem] font-medium">{m.attachment.name}</span>
          <span className="text-fg-subtle">· view</span>
        </a>
      )}
      {latestId === m.id && seenLabel.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-fg-subtle">
          <CheckCheck size={12} className="text-info" /> Seen by {seenLabel.join(", ")}
        </p>
      )}
      {m.pinned && <AckRow m={m} />}
    </div>
  );

  /* ───────────── Studio: bubbles, oldest first, writing box at the foot ───── */
  if (variant === "studio") {
    const chrono = [...groups].reverse().map((g) => ({ label: g.label, items: [...g.items].reverse() }));
    const older = chrono.length > 3 ? chrono.slice(0, chrono.length - 3) : [];
    const recent = chrono.slice(older.length);
    const link = "text-[11px] leading-4 text-[var(--st-muted)] transition-colors hover:text-[var(--st-ink)]";
    const StudioBubble = ({ m }: { m: ConvoMessage }) => {
      const mine = m.me || m.management;
      return (
        <div className={`group flex flex-col ${mine ? "items-end" : "items-start"}`}>
          <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-[var(--st-muted)]">
            {mine && m.me ? "You" : m.authorName} · {time(m.at)}
            {stageTag.has(m.id) && <span className="rounded-md bg-[var(--st-page)] px-1.5 py-px text-[10.5px] text-[var(--st-sub)]">→ {stageTag.get(m.id)}</span>}
          </div>
          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${mine ? "rounded-br-md bg-[#111214] text-white" : "rounded-bl-md bg-[var(--st-page)] text-[var(--st-ink)]"}`}>
            {m.parent && (
              <div className={`mb-1.5 border-l-2 pl-2 text-[11px] ${mine ? "border-white/30 text-white/70" : "border-[var(--st-line)] text-[var(--st-muted)]"}`}>
                ↪ {m.parent.authorName}: {m.parent.snippet}{m.parent.snippet.length >= 80 ? "…" : ""}
              </div>
            )}
            {editingId === m.id && editAction ? (
              <form action={runEdit} onSubmit={() => setTimeout(() => setEditingId(null), 0)} className="flex min-w-[240px] flex-col gap-2">
                <input type="hidden" name="updateId" value={m.id} />
                <input type="hidden" name="code" value={code} />
                <textarea name="body" defaultValue={m.body} rows={2} required className="w-full resize-y rounded-lg bg-white px-2.5 py-1.5 text-[13px] text-[#111214] outline-none" />
                <div className="flex items-center gap-2">
                  <button type="submit" className="inline-flex h-7 items-center gap-1 rounded-md bg-white px-2.5 text-xs font-semibold text-[#111214]"><Check size={12} /> Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs opacity-80">Cancel</button>
                </div>
              </form>
            ) : (
              !fileOnly(m) && <p className="whitespace-pre-wrap break-words">
                {segmentMentions(m.body, team).map((seg, i) =>
                  seg.mention ? <span key={i} className="font-semibold underline decoration-dotted underline-offset-2">{seg.text}</span> : <span key={i}>{seg.text}</span>,
                )}
              </p>
            )}
            {m.attachment && (
              <a href={`/api/portal/attachment?updateId=${m.id}`} target="_blank" rel="noreferrer" className={`mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${mine ? "bg-white/10" : "bg-[var(--st-surface)]"}`}>
                <Paperclip size={12} /><span className="max-w-[14rem] truncate">{m.attachment.name}</span>
              </a>
            )}
          </div>
          {deletingId === m.id && deleteAction ? (
            <form action={runDelete} onSubmit={() => setTimeout(() => setDeletingId(null), 0)} className="mt-1 flex items-center gap-2 px-1 text-[11px]">
              <input type="hidden" name="updateId" value={m.id} />
              <input type="hidden" name="code" value={code} />
              <span className="text-[var(--st-muted)]">Take this update down? It can be restored.</span>
              <button type="submit" className="font-semibold text-[var(--st-late-text)]">Take down</button>
              <button type="button" onClick={() => setDeletingId(null)} className="text-[var(--st-muted)]">Keep</button>
            </form>
          ) : (
            <div className="mt-1 flex items-center gap-2.5 px-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              {!closed && <button type="button" onClick={() => startReply(m)} className={link}>Reply</button>}
              {canPin && (
                <form action={runPin} className="flex">
                  <input type="hidden" name="updateId" value={m.id} />
                  <input type="hidden" name="code" value={code} />
                  <button type="submit" className={link}>{m.pinned ? "Unpin" : "Pin as instruction"}</button>
                </form>
              )}
              {!closed && editAction && (m.me || canModerate) && (
                <button type="button" onClick={() => { setEditingId(m.id); setDeletingId(null); }} className={link}>Correct</button>
              )}
              {!closed && deleteAction && (m.me || canModerate) && (
                <button type="button" onClick={() => { setDeletingId(m.id); setEditingId(null); }} className={link}>Take down</button>
              )}
            </div>
          )}
          {latestId === m.id && (
            <div className="mt-0.5 px-1 text-[11px] text-[var(--st-muted)]">
              {seenLabel.length > 0 ? <>Seen by {seenLabel.join(", ")}</> : "Not yet seen"}
            </div>
          )}
          {m.pinned && canAck && <AckRow m={m} />}
        </div>
      );
    };
    const item = (it: Item) => (it.kind === "msg" ? <StudioBubble key={`m${it.m.id}`} m={it.m} /> : <ChangeLine key={it.es[0].id} es={it.es} studio />);
    const day = (label: string) => <div className="pt-1 text-center text-[11px] uppercase tracking-[0.08em] text-[var(--st-muted)]">{label}</div>;

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {pinned.map((m) => (
          <div key={m.id} className="rounded-xl bg-[var(--st-page)] px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-xs text-[var(--st-sub)]">
              <Pin size={12} /> Current instruction
              <span className="grow" />
              {canPin && (
                <form action={runPin} className="flex">
                  <input type="hidden" name="updateId" value={m.id} />
                  <input type="hidden" name="code" value={code} />
                  <button type="submit" title="Unpin" className="text-[var(--st-muted)] hover:text-[var(--st-ink)]"><PinOff size={13} /></button>
                </form>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed">{m.body}</p>
            <p className="mt-0.5 text-xs text-[var(--st-muted)]">— {m.authorName}, {time(m.at)}</p>
          </div>
        ))}

        <section ref={threadRef} className="st-scroll -mr-3 flex min-h-[200px] flex-1 flex-col gap-2.5 overflow-y-auto pr-3 lg:min-h-0">
          {older.length > 0 && (
            <details>
              <summary className="cursor-pointer list-none py-1 text-center text-[11px] text-[var(--st-muted)] hover:text-[var(--st-ink)]">
                Show {older.reduce((n, g) => n + g.items.length, 0)} earlier item{older.reduce((n, g) => n + g.items.length, 0) === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 flex flex-col gap-2.5">
                {older.map((g) => <div key={g.label} className="flex flex-col gap-2.5">{day(g.label)}{g.items.map(item)}</div>)}
              </div>
            </details>
          )}
          {recent.map((g) => <div key={g.label} className="flex flex-col gap-2.5">{day(g.label)}{g.items.map(item)}</div>)}
          {groups.length === 0 && pinned.length === 0 && (
            <p className="py-8 text-center text-[13px] text-[var(--st-muted)]">No updates yet — the first one you post tells everyone on the task.</p>
          )}
        </section>

        {!closed && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--st-line-soft)] pt-3">
            <div className="flex flex-wrap gap-1.5">
              {starters.map(([label, text]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => { const el = taRef.current; if (!el) return; el.value = text; el.focus(); el.setSelectionRange(text.length, text.length); }}
                  className="h-7 rounded-lg border border-[var(--st-line)] px-2.5 text-xs text-[var(--st-sub)] transition-colors hover:bg-[var(--st-page)]"
                >
                  {label}
                </button>
              ))}
            </div>
            {replyTo && (
              <div className="flex items-center gap-2 rounded-lg bg-[var(--st-page)] px-2.5 py-1.5 text-xs">
                <CornerUpLeft size={12} />
                <span className="min-w-0 truncate text-[var(--st-sub)]">Replying to <b className="font-medium text-[var(--st-ink)]">{replyTo.author}</b>: {replyTo.snippet}…</span>
                <span className="grow" />
                <button type="button" onClick={() => setReplyTo(null)} aria-label="Stop replying"><X size={13} /></button>
              </div>
            )}
            <form action={runAdd} onSubmit={() => setTimeout(() => { setReplyTo(null); clearFile(); if (taRef.current) taRef.current.value = ""; }, 0)} className="flex flex-col gap-2">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="parentUpdateId" value={replyTo?.id ?? ""} />
              <input ref={fileRef} type="file" name="attachment" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
              <div className="relative">
                <textarea
                  ref={taRef}
                  name="body"
                  required={!fileName}
                  rows={2}
                  onChange={onComposerChange}
                  onKeyDown={onComposerKeyDown}
                  onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
                  placeholder={replyTo ? `Reply to ${replyTo.author}…` : "Write an update… use @ to mention someone"}
                  className="bare-field w-full resize-y rounded-xl border border-[var(--st-line)] bg-[var(--st-page)] px-3.5 py-2.5 text-[13px] outline-none placeholder:text-[var(--st-muted)] focus:border-[var(--st-muted)]"
                />
                {mentionMatches.length > 0 && (
                  <div className="absolute bottom-full left-2 z-10 mb-1 w-56 overflow-hidden rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] shadow-[0_16px_40px_rgba(17,18,20,0.16)]">
                    {mentionMatches.map((m, i) => (
                      <button key={m.id} type="button" onPointerDown={(e) => { e.preventDefault(); pickMention(m.name); }} className={`flex w-full items-center px-3 py-2.5 text-left text-[13px] hover:bg-[var(--st-page)] ${i === mentionIndex ? "bg-[var(--st-page)]" : ""}`}>{m.name}</button>
                    ))}
                  </div>
                )}
              </div>
              {fileName && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--st-page)] px-2.5 py-1.5 text-xs">
                  <Paperclip size={12} /><span className="max-w-[16rem] truncate font-medium">{fileName}</span>
                  <span className="grow" />
                  <button type="button" onClick={clearFile} aria-label="Remove the file"><X size={13} /></button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} title="Attach a file or photo" aria-label="Attach a file" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--st-line)] text-[var(--st-sub)] hover:text-[var(--st-ink)]">
                  <Paperclip size={14} />
                </button>
                <VoiceButton onResult={appendDictation} title="Speak your update" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--st-line)] text-[var(--st-sub)] hover:text-[var(--st-ink)]" />
                <span className="grow" />
                <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#111214] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90">
                  {replyTo ? "Reply" : "Post update"}
                </button>
              </div>
            </form>
            {composerHint && <p className="text-xs text-[var(--st-muted)]">{composerHint}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pinned-instruction banner */}
      {pinned.length > 0 && (
        <div className="flex flex-col gap-2">
          {pinned.map((m) => (
            <div key={m.id} className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                <Pin size={12} /> Current instruction
                <span className="grow" />
                {canPin && (
                  <form action={runPin} className="flex">
                    <input type="hidden" name="updateId" value={m.id} />
                    <input type="hidden" name="code" value={code} />
                    <button type="submit" title="Unpin" className="text-accent/70 hover:text-accent">
                      <PinOff size={13} />
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-1 text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.body}</p>
              <p className="mt-0.5 text-xs text-fg-muted">— {m.authorName}, {time(m.at)}</p>
              <AckRow m={m} />
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      {!closed && (
        <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-3">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-bg-subtle px-2.5 py-1.5 text-xs">
              <CornerUpLeft size={12} className="text-accent" />
              <span className="text-fg-muted">Replying to <span className="font-medium text-fg">{replyTo.author}</span>: <span className="italic">{replyTo.snippet}…</span></span>
              <span className="grow" />
              <button type="button" onClick={() => setReplyTo(null)} className="text-fg-subtle hover:text-fg"><X size={13} /></button>
            </div>
          )}
          <form action={runAdd} onSubmit={() => setTimeout(() => { setReplyTo(null); clearFile(); }, 0)} className="flex flex-col gap-2.5">
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="parentUpdateId" value={replyTo?.id ?? ""} />
            <input
              ref={fileRef}
              type="file"
              name="attachment"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            <div className="relative">
              <CaretTextarea
                ref={taRef}
                name="body"
                required={!fileName}
                rows={2}
                onChange={onComposerChange}
                onKeyDown={onComposerKeyDown}
                onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
                placeholder={replyTo ? `Reply to ${replyTo.author}…` : "Write an update… use @ to mention a teammate."}
                className="resize-y rounded-xl px-3.5 py-2.5 text-sm"
              />
              {mentionMatches.length > 0 && (
                <div className="absolute left-2 top-full z-10 mt-1 w-56 overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-pill">
                  {mentionMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onPointerDown={(e) => { e.preventDefault(); pickMention(m.name); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent-soft/60 transition-colors"
                    >
                      <span className="font-medium">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {fileName && (
              <div className="flex items-center gap-2 rounded-lg bg-bg-subtle px-2.5 py-1.5 text-xs">
                <Paperclip size={12} className="text-accent" />
                <span className="truncate max-w-[16rem] font-medium">{fileName}</span>
                <span className="grow" />
                <button type="button" onClick={clearFile} className="text-fg-subtle hover:text-fg"><X size={13} /></button>
              </div>
            )}
            {/* Composer footer — ONE height (h-9) across attach, dictate, the
                status Select and Post. They were 32/32/36/32 and the row read as
                four separate kits. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Attach a file or photo"
                  className="inline-flex items-center justify-center rounded-md bg-bg-subtle ring-1 ring-border h-9 w-9 text-fg-muted hover:text-accent transition-colors"
                >
                  <Paperclip size={14} />
                </button>
                <VoiceButton
                  onResult={appendDictation}
                  title="Dictate your update"
                  className="inline-flex items-center justify-center rounded-md bg-bg-subtle ring-1 ring-border h-9 w-9 text-fg-muted hover:text-accent transition-colors"
                />
              </div>
              <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent text-accent-fg px-3.5 text-xs font-semibold hover:opacity-90 transition-opacity">
                <Send size={13} /> {replyTo ? "Reply" : "Post"}
              </button>
            </div>
            {composerHint && <p className="text-xs text-fg-subtle">{composerHint}</p>}
          </form>
        </div>
      )}

      {/* Timeline */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
          <MessageSquare size={13} /> Conversation
        </div>
        {groups.length === 0 && pinned.length === 0 && (
          <div className="rounded-2xl bg-bg-elev ring-1 ring-border p-5 text-center text-sm text-fg-muted">
            No messages yet — post the first update above.
          </div>
        )}
        {groups.map((g, i) =>
          i < 2 ? (
            <div key={g.label} className="flex flex-col gap-2">
              <p className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">{g.label}</p>
              {g.items.map(renderItem)}
            </div>
          ) : (
            <details key={g.label}>
              <summary className="cursor-pointer list-none px-1 py-1 text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle hover:text-fg-muted transition-colors">
                {g.label} · {g.items.length} item{g.items.length === 1 ? "" : "s"} — tap to show
              </summary>
              <div className="mt-1 flex flex-col gap-2">{g.items.map(renderItem)}</div>
            </details>
          )
        )}
      </section>
    </div>
  );
}
