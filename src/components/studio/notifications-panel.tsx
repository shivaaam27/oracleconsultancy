"use client";

/**
 * The Studio notifications panel (mockup board Notifications, 24 Sept 2026).
 *
 * ⚠️ IT OWNS NO STATE AND NO FETCHING — `NotificationBell` still does all of
 * that (polling, read/dismiss, the push badge), and hands this panel its rows
 * and its actions. Two looks, one engine, exactly like Tasks.
 *
 * Follows the theme (`st-sheet`): white paper in light, dark and dotted in dark. Two lanes
 * (Needs you · Activity), filter chips, day groups, ORI's daily digests folded
 * into ONE row, and per-row actions: Open · Reply · Mark read · Dismiss.
 * Reply writes IN the panel (owner: "let me reply straight from the
 * notifications") — posted through `replyToTaskByCode` → addTaskUpdateCore,
 * the task's own writer, so it lands on the task's conversation.
 */
import { DeviceAlertsRow } from "@/components/notification-settings";
import { PersonFace } from "@/components/studio/face";
import { useMemo, useState, useTransition } from "react";
import { replyToTaskByCode } from "@/app/task/actions";
import { useToast } from "@/components/toast";
import { Check, CheckCheck, ChevronDown, CornerUpLeft, Loader2, Settings as SettingsIcon, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  groupNotifications, isDailyReminder, isSystemDigest, notifAgo, notifBucket, notifLane,
  type NotifGroup, type NotifRow,
} from "@/lib/notification-view";
import { avatarTint, initials } from "@/components/studio/tasks/task-words";
import { cn } from "@/lib/cn";

type Filter = "all" | "mentions" | "updates" | "reminders" | "ori";
const FILTERS: [Filter, string][] = [["all", "All"], ["mentions", "Mentions"], ["updates", "Updates"], ["reminders", "Reminders"], ["ori", "ORI"]];
const VERB: Record<string, string> = {
  assigned: "assigned you", update: "updated", mention: "mentioned you on", chat_mention: "mentioned you in a chat",
  reply: "replied on", pinned: "pinned an instruction on", chat: "messaged you", announcement: "announced",
  meeting: "scheduled", leave: "asked for leave",
};

function matches(n: NotifRow, f: Filter) {
  if (f === "all") return true;
  if (f === "ori") return isSystemDigest(n);
  if (f === "reminders") return isDailyReminder(n) || n.kind === "reminder";
  if (f === "mentions") return n.kind === "mention" || n.kind === "chat_mention" || n.kind === "reply";
  return n.kind === "update" || n.kind === "pinned" || n.kind === "assigned";
}

export function StudioNotificationsPanel({
  items, onClose, onOpen, onRead, onDismiss, onReadAll,
}: {
  items: NotifRow[];
  onClose: () => void;
  onOpen: (g: NotifGroup) => void;
  onRead: (g: NotifGroup) => void;
  onDismiss: (g: NotifGroup) => void;
  onReadAll: () => void;
}) {
  const needsCount = items.filter((n) => notifLane(n) === "needs-you").length;
  const [lane, setLane] = useState<"needs-you" | "activity">(needsCount ? "needs-you" : "activity");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [digestOpen, setDigestOpen] = useState(false);
  const [replyKey, setReplyKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, start] = useTransition();
  const { toast } = useToast();
  function sendReply(g: NotifGroup) {
    const code = g.lead.taskCode;
    if (!code || !draft.trim()) return;
    start(async () => {
      const res = await replyToTaskByCode(code, draft);
      if (!res.ok) { toast(res.error ?? "Couldn't post the reply.", { tone: "warn" }); return; }
      toast(`Reply posted on ${code}.`, { tone: "success" });
      setDraft("");
      setReplyKey(null);
      onRead(g);
    });
  }

  const view = useMemo(() => {
    const inLane = items.filter((n) => notifLane(n) === lane && matches(n, filter));
    // ORI's daily checks are several rows written at 09:00 — ONE summary row here.
    const digests = inLane.filter(isSystemDigest);
    const rest = inLane.filter((n) => !isSystemDigest(n));
    return { digests, groups: groupNotifications(rest) };
  }, [items, lane, filter]);

  const unread = items.filter((n) => !n.readAt).length;
  const laneUnread = (l: "needs-you" | "activity") => items.filter((n) => notifLane(n) === l && !n.readAt).length;
  const laneTotal = (l: "needs-you" | "activity") => items.filter((n) => notifLane(n) === l).length;

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      /* `st-sheet`: white paper in light mode, the dark dotted card in dark mode
         (owner: "behave with light and dark mode and not a fixed dark mode"). */
      className="studio st-sheet st-sheet-dots st-pop fixed inset-x-0 bottom-0 z-[60] flex max-h-[calc(100dvh-60px)] w-full flex-col gap-3 rounded-t-[26px] bg-[var(--sh-bg)] px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-4 text-[var(--sh-fg)] shadow-[0_30px_80px_rgba(0,0,0,0.45)] sm:inset-x-auto sm:bottom-[calc(var(--foot-h)+var(--foot-safe)+8px)] sm:right-6 sm:max-h-[calc(100dvh-100px)] sm:w-[min(520px,calc(100vw-24px))] sm:rounded-3xl sm:pb-3.5"
    >
      <div className="flex items-center gap-2 px-1 sm:gap-2.5">
        <span className="min-w-0 truncate text-[18px] font-medium tracking-[-0.01em] sm:text-[20px]">Notifications</span>
        {unread > 0 && <span className="shrink-0 whitespace-nowrap rounded-[7px] bg-[var(--sh-pink-bg)] px-2 py-0.5 text-[11px] text-[var(--sh-pink-fg)]">{unread} new</span>}
        <span className="flex-1" />
        {unread > 0 && (
          <button type="button" onClick={onReadAll} aria-label="Mark all read" title="Mark all read" className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[var(--sh-chip-line)] px-2 text-xs text-[var(--sh-sub)] hover:text-[var(--sh-fg)] sm:px-2.5">
            <CheckCheck size={13} /><span className="hidden sm:inline">Mark all read</span>
          </button>
        )}
        <Link href="/settings#notifications" onClick={onClose} aria-label="Notification settings" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]"><SettingsIcon size={13} /></Link>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]"><X size={13} /></button>
      </div>

      <div className="flex gap-0.5 rounded-xl bg-[var(--sh-field)] p-[3px]">
        {([["needs-you", "Needs you"], ["activity", "Activity"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setLane(k); setOpenKey(null); }}
            className={cn("flex h-8 flex-1 items-center justify-center gap-2 rounded-[9px] text-xs font-medium", lane === k ? "bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]" : "text-[var(--sh-sub)] hover:text-[var(--sh-fg)]")}>
            {l}<span className="text-[11px] opacity-70">{laneUnread(k) || laneTotal(k)}</span>
          </button>
        ))}
      </div>

      <div className="-mx-4 flex shrink-0 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={cn("h-[30px] shrink-0 whitespace-nowrap rounded-[9px] border px-2.5 text-xs", filter === k ? "border-[var(--sh-on-bg)] bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]" : "border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]")}>
            {l}
          </button>
        ))}
      </div>

      <div className="st-scroll -mr-2 flex min-h-[160px] flex-1 flex-col gap-1 overflow-y-auto pr-2">
        {view.digests.length > 0 && (
          <div className="rounded-[14px] border border-dashed border-[var(--sh-chip-line)] px-3 py-2.5">
            <button type="button" onClick={() => setDigestOpen((v) => !v)} className="flex w-full items-start gap-2.5 text-left">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]"><Sparkles size={14} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px]"><b className="font-semibold">ORI’s daily summary</b> <span className="text-[var(--sh-sub)]">· {view.digests.length} {view.digests.length === 1 ? "note" : "notes"}</span></span>
                <span className="mt-0.5 block truncate text-xs text-[var(--sh-sub)]">{view.digests.map((d) => d.title).join(" · ")}</span>
              </span>
              <ChevronDown size={14} className={cn("mt-1 shrink-0 text-[var(--sh-muted)] transition-transform", digestOpen && "rotate-180")} />
            </button>
            {digestOpen && (
              <div className="mt-2 space-y-1.5 pl-10">
                {view.digests.map((d) => (
                  <div key={d.id} className="text-xs">
                    <div className="text-[var(--sh-fg)]">{d.title}</div>
                    {d.body && <div className="text-[var(--sh-muted)]">{d.body}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view.groups.length === 0 && view.digests.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sh-field)] text-[var(--sh-muted)]"><Check size={18} /></span>
            <p className="text-[13px] text-[var(--sh-sub)]">{lane === "needs-you" ? "Nothing needs you." : "No recent activity."}</p>
          </div>
        )}

        {view.groups.map((g, i) => {
          const bucket = notifBucket(g.lead.createdAt);
          const prev = i > 0 ? notifBucket(view.groups[i - 1].lead.createdAt) : null;
          const n = g.lead;
          const isOpen = openKey === g.key;
          const actor = n.actor || (isDailyReminder(n) ? "Reminder" : "Oracle");
          const task = n.body?.trim() || n.title;
          return (
            <div key={g.key}>
              {bucket !== prev && <div className="px-3 pb-1 pt-2 text-[11px] text-[var(--sh-muted)]">{bucket}</div>}
              <div className={cn("group flex gap-2.5 rounded-[14px] px-3 py-2.5 transition-colors", isOpen ? "bg-[var(--sh-field)]" : "hover:bg-[var(--sh-card)]")}>
                <span className={cn("mt-[11px] h-[7px] w-[7px] shrink-0 rounded-full", g.unread ? "bg-[#2490EF]" : "bg-transparent")} />
                <PersonFace name={actor} size={30} />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setOpenKey(isOpen ? null : g.key)} className="block w-full text-left">
                    <span className="block text-[13px] leading-snug">
                      <b className="font-semibold">{n.actor ?? (isDailyReminder(n) ? "Daily reminder" : "Oracle")}</b>{" "}
                      <span className="text-[var(--sh-sub)]">{VERB[n.kind] ?? "updated"}</span>{" "}
                      {n.taskCode && <span className="st-mono whitespace-nowrap rounded-[5px] bg-[var(--sh-hover)] px-1.5 py-px text-[11px] text-[var(--sh-fg)]">{n.taskCode}</span>}
                      {notifLane(n) === "needs-you" && <span className="ml-1.5 whitespace-nowrap rounded-[5px] bg-[var(--sh-pink-bg)] px-1.5 py-px text-[10px] text-[var(--sh-pink-fg)]">needs you</span>}
                    </span>
                    <span className={cn("mt-0.5 block text-xs leading-relaxed text-[var(--sh-sub)]", isOpen ? "" : "line-clamp-2")}>{task}</span>
                    <span className="mt-1 block text-[11px] text-[var(--sh-muted)]">{notifAgo(n.createdAt)}{g.count > 1 ? ` · ${g.count} of these` : ""}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => onOpen(g)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--sh-on-bg)] px-2.5 text-[11px] font-medium text-[var(--sh-on-fg)]">Open</button>
                      {n.taskCode && <button type="button" onClick={() => { setReplyKey(replyKey === g.key ? null : g.key); setDraft(""); }} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--sh-chip-line)] px-2.5 text-[11px] text-[var(--sh-fg)]"><CornerUpLeft size={11} />Reply</button>}
                      {g.unread > 0 && <button type="button" onClick={() => onRead(g)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--sh-chip-line)] px-2.5 text-[11px] text-[var(--sh-fg)]"><Check size={11} />Mark read</button>}
                      <button type="button" onClick={() => { onDismiss(g); setOpenKey(null); setReplyKey(null); }} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--sh-chip-line)] px-2.5 text-[11px] text-[var(--sh-sub)]"><X size={11} />Dismiss</button>
                    </div>
                  )}
                  {isOpen && replyKey === g.key && n.taskCode && (
                    <div className="mt-2 rounded-xl border border-[var(--sh-field-line)] bg-[var(--sh-field)] p-2">
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(g); }
                          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setReplyKey(null); }
                        }}
                        rows={2}
                        placeholder={`Reply on ${n.taskCode} — it goes on the task’s conversation`}
                        style={{ background: "transparent", border: 0, boxShadow: "none", color: "var(--sh-fg)" }}
                        className="bare-field w-full resize-none px-1.5 py-1 text-[13px] outline-none placeholder:text-[var(--sh-muted)]"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-1.5 text-[11px] text-[var(--sh-muted)]">Enter posts · Shift+Enter new line</span>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setReplyKey(null)} className="h-7 rounded-lg px-2.5 text-[11px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">Cancel</button>
                          <button type="button" disabled={sending || !draft.trim()} onClick={() => sendReply(g)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--sh-on-bg)] px-3 text-[11px] font-medium text-[var(--sh-on-fg)] disabled:opacity-50">
                            {sending && <Loader2 size={11} className="animate-spin" />}Post reply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--sh-line)] pt-2.5"><DeviceAlertsRow /></div>
      <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-[var(--sh-muted)]">
        <span>Read notifications clear themselves after 14 days</span>
      </div>
    </div>
  );
}
