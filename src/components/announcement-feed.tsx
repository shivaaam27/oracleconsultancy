"use client";

import { useEffect, useState, useTransition } from "react";
import { Megaphone, CheckCircle2, Pin, MessageCircle, Send } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  TYPE_LABEL, TYPE_TONE, REACTION_EMOJIS,
  type FeedAnnouncement, type AnnouncementComment,
} from "@/lib/announcements-shared";
import {
  portalMarkSeenAction, portalAcknowledgeAction,
  portalToggleReactionAction, getCommentsAction, portalAddCommentAction,
} from "@/app/announcements/actions";

const TYPE_BADGE: Record<string, "accent" | "info" | "warn" | "success" | "danger" | "default"> = {
  accent: "accent", info: "info", warn: "warn", success: "success", danger: "danger", muted: "default",
};

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function authorLabel(createdBy: string): string {
  if (createdBy.startsWith("portal-dir:") || createdBy.startsWith("portal-mgr:")) return createdBy.slice(11);
  return "Management";
}

function FeedCard({ a }: { a: FeedAnnouncement }) {
  const [acked, setAcked] = useState(a.ackAt != null);
  const [pending, start] = useTransition();

  // Reactions — optimistic local state.
  const [counts, setCounts] = useState<Record<string, number>>(a.reactions);
  const [mine, setMine] = useState<string[]>(a.myReactions);

  // Questions — lazy-loaded on expand.
  const [showQ, setShowQ] = useState(false);
  const [comments, setComments] = useState<AnnouncementComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [qPending, startQ] = useTransition();

  function toggle(emoji: string) {
    const on = mine.includes(emoji);
    setMine((m) => (on ? m.filter((e) => e !== emoji) : [...m, emoji]));
    setCounts((c) => ({ ...c, [emoji]: Math.max(0, (c[emoji] ?? 0) + (on ? -1 : 1)) }));
    void portalToggleReactionAction(a.id, emoji);
  }

  function openQuestions() {
    const next = !showQ;
    setShowQ(next);
    if (next && comments === null) {
      startQ(async () => { setComments(await getCommentsAction(a.id)); });
    }
  }

  function postComment() {
    const text = draft.trim();
    if (!text) return;
    startQ(async () => {
      const res = await portalAddCommentAction(a.id, text);
      if (res.ok) { setDraft(""); setComments(await getCommentsAction(a.id)); }
    });
  }

  function ack() {
    start(async () => {
      const res = await portalAcknowledgeAction(a.id);
      if (res.ok) setAcked(true);
    });
  }

  const commentN = comments?.length ?? a.commentCount;

  return (
    <Panel className={a.type === "urgent" ? "p-4 ring-1 ring-danger/30 bg-danger-soft/20" : "p-4"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Megaphone size={13} className="text-fg-muted" />
        <Badge tone={TYPE_BADGE[TYPE_TONE[a.type]] ?? "default"}>{TYPE_LABEL[a.type]}</Badge>
        {a.pinned && <Pin size={12} className="text-accent" />}
        <span className="grow" />
        <span className="text-[11px] text-fg-subtle">{authorLabel(a.createdBy)} · {timeLabel(a.publishedAt ?? a.createdAt)}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold leading-snug">{a.title}</p>
      {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted leading-relaxed">{a.body}</p>}

      {a.requireAck && (
        <div className="mt-2.5">
          {acked ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 size={14} /> You've acknowledged this
            </span>
          ) : (
            <Button size="sm" loading={pending} onClick={ack} className="gap-1.5">
              <CheckCircle2 size={14} /> I&apos;ve read &amp; understood
            </Button>
          )}
        </div>
      )}

      {/* Reactions + questions toggle */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {REACTION_EMOJIS.map((e) => {
          const n = counts[e] ?? 0;
          const on = mine.includes(e);
          return (
            <button
              key={e}
              type="button"
              onClick={() => toggle(e)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                on ? "border-accent/40 bg-accent-soft text-fg" : "border-border bg-bg-elev text-fg-muted hover:bg-bg-muted/60"
              )}
            >
              <span>{e}</span>
              {n > 0 && <span className="tabular">{n}</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={openQuestions}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-muted/60 transition-colors"
        >
          <MessageCircle size={13} /> {commentN > 0 ? `Questions (${commentN})` : "Ask a question"}
        </button>
      </div>

      {showQ && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {comments === null ? (
            <p className="text-xs text-fg-subtle">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-fg-subtle">No questions yet. Be the first to ask.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {comments.map((c) => (
                <li key={c.id} className={cn("rounded-xl px-3 py-2 text-sm", c.isAnswer ? "bg-accent-soft/50 ring-1 ring-accent/20" : "bg-bg-subtle/50")}>
                  <p className="text-[11px] font-medium text-fg-muted">{c.authorName}{c.isAnswer ? " · reply" : ""}</p>
                  <p className="whitespace-pre-wrap text-fg">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              placeholder="Ask a question…"
              className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-bg-elev px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent-ring/50"
            />
            <Button size="sm" loading={qPending} disabled={!draft.trim()} onClick={postComment} className="shrink-0 gap-1.5">
              <Send size={13} /> Post
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Staff-facing announcement list. Marks each item seen on mount; cards carry
 *  acknowledge, reactions and a questions thread. */
export function AnnouncementFeed({ items }: { items: FeedAnnouncement[] }) {
  useEffect(() => {
    const unseen = items.filter((a) => !a.seenAt);
    unseen.forEach((a) => { void portalMarkSeenAction(a.id); });
  }, [items]);

  if (items.length === 0) {
    return <Panel className="p-6 text-center text-sm text-fg-muted">No announcements right now.</Panel>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((a) => <FeedCard key={a.id} a={a} />)}
    </div>
  );
}
