"use client";

import { useRef, useState } from "react";
import { Check, CheckCheck, CornerUpLeft, MessageSquare, Paperclip, Pencil, Pin, PinOff, Send, Trash2, X } from "lucide-react";
import { segmentMentions, type MentionCandidate } from "@/lib/mentions";
import { CaretTextarea } from "./ui";
import { VoiceButton } from "./voice-button";

/* Shared conversation view for a task — used by BOTH the staff portal and the
 * admin control centre. Chat-style messages with replies, @mentions, file
 * attachments, voice dictation, inline system-event markers, and a pinned
 * instruction banner. The server precomputes display fields; the page injects
 * its own server actions + capability flags, so the same component serves the
 * limited staff view and the full-powered admin view. */

type ServerAction = (formData: FormData) => void | Promise<void>;

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
};

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

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function PortalConversation(props: Props) {
  const {
    taskId, code, closed, statusOptions, currentStatus, messages, events, latestId, seenLabel, team,
    addAction, pinAction, ackAction, editAction, deleteAction, canPin, canAck, canModerate, composerHint, onPosted,
  } = props;
  // Which message is being edited / confirming deletion (moderation controls).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // If a caller wants to know exactly when a post/pin finished (the admin task
  // drawer, to refetch), wrap the server action to fire onPosted after it resolves.
  const runAdd: ServerAction = onPosted ? async (fd) => { await addAction(fd); onPosted(); } : addAction;
  const runPin: ServerAction = onPosted ? async (fd) => { await pinAction(fd); onPosted(); } : pinAction;
  const [replyTo, setReplyTo] = useState<{ id: number; author: string; snippet: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
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

  function onComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /@([\p{L}\p{N}' ]{0,30})$/u.exec(upto);
    setMentionQuery(m ? m[1] : null);
  }

  function pickMention(name: string) {
    const el = taRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret).replace(/@([\p{L}\p{N}' ]{0,30})$/u, `@${name} `);
    const after = el.value.slice(caret);
    el.value = before + after;
    const pos = before.length;
    el.setSelectionRange(pos, pos);
    el.focus();
    setMentionQuery(null);
  }

  const pinned = messages.filter((m) => m.pinned);
  const rest = messages.filter((m) => !m.pinned);

  // Merge messages + system events into one stream, newest first.
  type Item = { kind: "msg"; at: string; m: ConvoMessage } | { kind: "event"; at: string; e: ConvoEvent };
  const merged: Item[] = [
    ...rest.map((m) => ({ kind: "msg" as const, at: m.at, m })),
    ...events.map((e) => ({ kind: "event" as const, at: e.at, e })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

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
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
          <CheckCheck size={12} /> You confirmed you&apos;ve read this
        </span>
      )}
      {canAck && ackAction && !m.iAcked && (
        <form action={ackAction}>
          <input type="hidden" name="updateId" value={m.id} />
          <input type="hidden" name="code" value={code} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-fg px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 transition-opacity"
          >
            <Check size={12} /> Understood
          </button>
        </form>
      )}
      {m.ackNames.length > 0 && <span className="text-[11px] text-fg-subtle">Read by {m.ackNames.join(", ")}</span>}
      {canAck === false && m.ackNames.length === 0 && (
        <span className="text-[11px] text-fg-subtle">Not yet acknowledged</span>
      )}
    </div>
  );

  const EventMarker = ({ e }: { e: ConvoEvent }) => (
    <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-fg-subtle">
      <span className="h-px grow bg-border/60" />
      <span className="shrink-0">{e.text} · {time(e.at)}</span>
      <span className="h-px grow bg-border/60" />
    </div>
  );

  const renderItem = (it: Item) =>
    it.kind === "msg" ? <Bubble key={`m${it.m.id}`} m={it.m} /> : <EventMarker key={it.e.id} e={it.e} />;

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
          <form action={runPin}>
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
        <div className="mt-1.5 rounded-lg border-l-2 border-accent/40 bg-bg-subtle/50 px-2 py-1 text-[11px] text-fg-muted">
          <span className="font-medium text-fg-subtle">↪ {m.parent.authorName}: </span>
          <span className="italic">{m.parent.snippet}{m.parent.snippet.length >= 80 ? "…" : ""}</span>
        </div>
      )}

      {editingId === m.id && editAction ? (
        <form action={editAction} onSubmit={() => setTimeout(() => setEditingId(null), 0)} className="mt-1.5 flex flex-col gap-2">
          <input type="hidden" name="updateId" value={m.id} />
          <input type="hidden" name="code" value={code} />
          <textarea name="body" defaultValue={m.body} rows={2} required className="w-full resize-y rounded-xl bg-bg-elev px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40" />
          <div className="flex items-center gap-2">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-fg hover:opacity-90 transition-opacity"><Check size={12} /> Save</button>
            <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg">Cancel</button>
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
        <form action={deleteAction} onSubmit={() => setTimeout(() => setDeletingId(null), 0)} className="mt-2 flex items-center gap-2 rounded-lg bg-danger-soft/40 px-2.5 py-1.5 text-[12px] ring-1 ring-danger/20">
          <input type="hidden" name="updateId" value={m.id} />
          <input type="hidden" name="code" value={code} />
          <span className="text-fg-muted">Delete this note?</span>
          <span className="grow" />
          <button type="submit" className="inline-flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"><Trash2 size={11} /> Delete</button>
          <button type="button" onClick={() => setDeletingId(null)} className="rounded-md px-1.5 py-1 text-[11px] text-fg-muted hover:text-fg">Keep</button>
        </form>
      )}

      {m.attachment && (
        <a
          href={`/api/portal/attachment?updateId=${m.id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-bg-elev ring-1 ring-border px-3 py-2 text-xs hover:ring-accent/40 transition-colors"
        >
          <Paperclip size={14} className="text-accent shrink-0" />
          <span className="truncate max-w-[16rem] font-medium">{m.attachment.name}</span>
          <span className="text-fg-subtle">· view</span>
        </a>
      )}
      {latestId === m.id && seenLabel.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-fg-subtle">
          <CheckCheck size={12} className="text-info" /> Seen by {seenLabel.join(", ")}
        </p>
      )}
      {m.pinned && <AckRow m={m} />}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Pinned-instruction banner */}
      {pinned.length > 0 && (
        <div className="flex flex-col gap-2">
          {pinned.map((m) => (
            <div key={m.id} className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                <Pin size={12} /> Current instruction
                <span className="grow" />
                {canPin && (
                  <form action={runPin}>
                    <input type="hidden" name="updateId" value={m.id} />
                    <input type="hidden" name="code" value={code} />
                    <button type="submit" title="Unpin" className="text-accent/70 hover:text-accent">
                      <PinOff size={13} />
                    </button>
                  </form>
                )}
              </div>
              <p className="mt-1 text-sm font-medium leading-relaxed whitespace-pre-wrap">{m.body}</p>
              <p className="mt-0.5 text-[11px] text-fg-muted">— {m.authorName}, {time(m.at)}</p>
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
                      onMouseDown={(e) => { e.preventDefault(); pickMention(m.name); }}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Attach a file or photo"
                  className="inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border h-8 w-8 text-fg-muted hover:text-accent transition-colors"
                >
                  <Paperclip size={14} />
                </button>
                <VoiceButton
                  onResult={appendDictation}
                  title="Dictate your update"
                  className="inline-flex items-center justify-center rounded-lg bg-bg-subtle ring-1 ring-border h-8 w-8 text-fg-muted hover:text-accent transition-colors"
                />
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  Status
                  <select name="newStatus" defaultValue="" className="rounded-xl px-2.5 py-1.5 text-xs focus:outline-none">
                    <option value="">No change</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-fg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity">
                <Send size={13} /> {replyTo ? "Reply" : "Post"}
              </button>
            </div>
            {composerHint && <p className="text-[11px] text-fg-subtle">{composerHint}</p>}
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
              <p className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{g.label}</p>
              {g.items.map(renderItem)}
            </div>
          ) : (
            <details key={g.label}>
              <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle hover:text-fg-muted transition-colors">
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
