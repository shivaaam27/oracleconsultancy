"use client";

import { useRef, useState } from "react";
import { Check, CheckCheck, CornerUpLeft, MessageSquare, Pin, PinOff, Send, X } from "lucide-react";
import { portalAcknowledge, portalAddUpdate, portalTogglePin } from "@/app/portal/actions";
import { segmentMentions, type MentionCandidate } from "@/lib/mentions";

/* T2 conversation view for a portal task: chat-style messages with replies,
 * a pinned-instruction banner, Understood/Read-by, and a composer that can
 * target a reply. Server precomputes display fields so this stays simple. */

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
};

type Props = {
  taskId: number;
  code: string;
  isManager: boolean;
  closed: boolean;
  statusOptions: string[];
  currentStatus: string;
  messages: ConvoMessage[]; // newest first
  latestId: number | null;
  seenLabel: string[];
  team: MentionCandidate[]; // for @mention autocomplete + highlighting
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
  const { taskId, code, isManager, closed, statusOptions, currentStatus, messages, latestId, seenLabel, team } = props;
  const [replyTo, setReplyTo] = useState<{ id: number; author: string; snippet: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

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

  // Group the non-pinned messages by day (newest first).
  const groups: Array<{ label: string; items: ConvoMessage[] }> = [];
  for (const m of rest) {
    const label = dayLabel(m.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  function startReply(m: ConvoMessage) {
    setReplyTo({ id: m.id, author: m.authorName, snippet: m.body.slice(0, 80) });
    taRef.current?.focus();
    taRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const AckRow = ({ m }: { m: ConvoMessage }) => (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
      {m.iAcked ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
          <CheckCheck size={12} /> You confirmed you&apos;ve read this
        </span>
      ) : (
        <form action={portalAcknowledge}>
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
    </div>
  );

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
        {isManager && (
          <form action={portalTogglePin}>
            <input type="hidden" name="updateId" value={m.id} />
            <input type="hidden" name="code" value={code} />
            <button type="submit" title={m.pinned ? "Unpin" : "Pin as the current instruction"} className="text-fg-subtle hover:text-accent transition-colors">
              {m.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
          </form>
        )}
        <span className="text-fg-subtle">{time(m.at)}</span>
      </div>

      {m.parent && (
        <div className="mt-1.5 rounded-lg border-l-2 border-accent/40 bg-bg-subtle/50 px-2 py-1 text-[11px] text-fg-muted">
          <span className="font-medium text-fg-subtle">↪ {m.parent.authorName}: </span>
          <span className="italic">{m.parent.snippet}{m.parent.snippet.length >= 80 ? "…" : ""}</span>
        </div>
      )}

      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
        {segmentMentions(m.body, team).map((seg, i) =>
          seg.mention ? (
            <span key={i} className="rounded bg-accent-soft px-0.5 font-medium text-accent">{seg.text}</span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>

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
                {isManager && (
                  <form action={portalTogglePin}>
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
          <form action={portalAddUpdate} onSubmit={() => setTimeout(() => setReplyTo(null), 0)} className="flex flex-col gap-2.5">
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="parentUpdateId" value={replyTo?.id ?? ""} />
            <div className="relative">
              <textarea
                ref={taRef}
                name="body"
                required
                rows={2}
                onChange={onComposerChange}
                onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
                placeholder={replyTo ? `Reply to ${replyTo.author}…` : "Write an update… use @ to mention a teammate."}
                className="w-full resize-y rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-2.5 text-sm outline-none focus:ring-accent/50"
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                Status
                <select name="newStatus" defaultValue="" className="rounded-xl bg-bg-subtle ring-1 ring-border px-2.5 py-1.5 text-xs outline-none">
                  <option value="">No change</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-fg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity">
                <Send size={13} /> {replyTo ? "Reply" : "Post"}
              </button>
            </div>
            <p className="text-[11px] text-fg-subtle">
              {isManager
                ? "As a manager you can mark this task Completed once you're satisfied."
                : "Marking work finished? Choose Under Review — your manager confirms completion."}
            </p>
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
              {g.items.map((m) => <Bubble key={m.id} m={m} />)}
            </div>
          ) : (
            <details key={g.label}>
              <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle hover:text-fg-muted transition-colors">
                {g.label} · {g.items.length} message{g.items.length === 1 ? "" : "s"} — tap to show
              </summary>
              <div className="mt-1 flex flex-col gap-2">{g.items.map((m) => <Bubble key={m.id} m={m} />)}</div>
            </details>
          )
        )}
      </section>
    </div>
  );
}
