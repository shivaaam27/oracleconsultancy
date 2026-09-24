"use client";

/**
 * The Studio notifications panel (mockup board Notifications, 24 Sept 2026).
 *
 * ⚠️ IT OWNS NO STATE AND NO FETCHING — `NotificationBell` still does all of
 * that (polling, read/dismiss, the push badge), and hands this panel its rows
 * and its actions. Two looks, one engine, exactly like Tasks.
 *
 * Dark and dotted, like everything that opens from the footer. Two lanes
 * (Needs you · Activity), filter chips, day groups, ORI's daily digests folded
 * into ONE row, and per-row actions: Open · Reply · Mark read · Dismiss.
 */
import { useMemo, useState } from "react";
import { Check, CheckCheck, ChevronDown, CornerUpLeft, Settings as SettingsIcon, Sparkles, X } from "lucide-react";
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
  items, onClose, onOpen, onReply, onRead, onDismiss, onReadAll,
}: {
  items: NotifRow[];
  onClose: () => void;
  onOpen: (g: NotifGroup) => void;
  onReply: (g: NotifGroup) => void;
  onRead: (g: NotifGroup) => void;
  onDismiss: (g: NotifGroup) => void;
  onReadAll: () => void;
}) {
  const needsCount = items.filter((n) => notifLane(n) === "needs-you").length;
  const [lane, setLane] = useState<"needs-you" | "activity">(needsCount ? "needs-you" : "activity");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [digestOpen, setDigestOpen] = useState(false);

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
      /* Inline: `.studio` sets the ink colour unlayered, which beats a text utility
         — every name on this dark panel was drawn dark on dark. */
      style={{ color: "#F2F2F0" }}
      className="studio st-tex-dots st-pop fixed bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] right-3 z-[60] flex max-h-[calc(100dvh-100px)] w-[min(520px,calc(100vw-24px))] flex-col gap-3 rounded-3xl bg-[#141517] px-4 pb-3.5 pt-4 text-[#F2F2F0] shadow-[0_30px_80px_rgba(0,0,0,0.45)] sm:right-6"
    >
      <div className="flex items-center gap-2.5 px-1">
        <span className="text-[20px] font-medium tracking-[-0.01em]">Notifications</span>
        {unread > 0 && <span className="rounded-[7px] bg-[#3A1D2E] px-2 py-0.5 text-[11px] text-[#F07BBE]">{unread} new</span>}
        <span className="flex-1" />
        {unread > 0 && (
          <button type="button" onClick={onReadAll} className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border border-[#2E3035] px-2.5 text-xs text-[#C9CBCF] hover:text-white">
            <CheckCheck size={12} />Mark all read
          </button>
        )}
        <Link href="/settings#notifications" onClick={onClose} aria-label="Notification settings" className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[#2E3035] text-[#C9CBCF] hover:text-white"><SettingsIcon size={13} /></Link>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[#2E3035] text-[#C9CBCF] hover:text-white"><X size={13} /></button>
      </div>

      <div className="flex gap-0.5 rounded-xl bg-[#1F2023] p-[3px]">
        {([["needs-you", "Needs you"], ["activity", "Activity"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setLane(k); setOpenKey(null); }}
            className={cn("flex h-8 flex-1 items-center justify-center gap-2 rounded-[9px] text-xs font-medium", lane === k ? "bg-[#F2F2F0] text-[#111214]" : "text-[#A3A6AB] hover:text-white")}>
            {l}<span className="text-[11px] opacity-70">{laneUnread(k) || laneTotal(k)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={cn("h-[30px] rounded-[9px] border px-2.5 text-xs", filter === k ? "border-[#F2F2F0] bg-[#F2F2F0] text-[#111214]" : "border-[#2E3035] text-[#A3A6AB] hover:text-white")}>
            {l}
          </button>
        ))}
      </div>

      <div className="st-scroll -mr-2 flex min-h-[160px] flex-1 flex-col gap-1 overflow-y-auto pr-2">
        {view.digests.length > 0 && (
          <div className="rounded-[14px] border border-dashed border-[#34363B] px-3 py-2.5">
            <button type="button" onClick={() => setDigestOpen((v) => !v)} className="flex w-full items-start gap-2.5 text-left">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#F2F2F0] text-[#111214]"><Sparkles size={14} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px]"><b className="font-semibold">ORI’s daily summary</b> <span className="text-[#A3A6AB]">· {view.digests.length} {view.digests.length === 1 ? "note" : "notes"}</span></span>
                <span className="mt-0.5 block truncate text-xs text-[#A3A6AB]">{view.digests.map((d) => d.title).join(" · ")}</span>
              </span>
              <ChevronDown size={14} className={cn("mt-1 shrink-0 text-[#8E9197] transition-transform", digestOpen && "rotate-180")} />
            </button>
            {digestOpen && (
              <div className="mt-2 space-y-1.5 pl-10">
                {view.digests.map((d) => (
                  <div key={d.id} className="text-xs">
                    <div className="text-[#E6E6E3]">{d.title}</div>
                    {d.body && <div className="text-[#8E9197]">{d.body}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view.groups.length === 0 && view.digests.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1F2023] text-[#8E9197]"><Check size={18} /></span>
            <p className="text-[13px] text-[#A3A6AB]">{lane === "needs-you" ? "Nothing needs you." : "No recent activity."}</p>
          </div>
        )}

        {view.groups.map((g, i) => {
          const bucket = notifBucket(g.lead.createdAt);
          const prev = i > 0 ? notifBucket(view.groups[i - 1].lead.createdAt) : null;
          const n = g.lead;
          const isOpen = openKey === g.key;
          const actor = n.actor || (isDailyReminder(n) ? "Reminder" : "COS");
          const task = n.body?.trim() || n.title;
          return (
            <div key={g.key}>
              {bucket !== prev && <div className="px-3 pb-1 pt-2 text-[11px] text-[#6E7177]">{bucket}</div>}
              <div className={cn("group flex gap-2.5 rounded-[14px] px-3 py-2.5 transition-colors", isOpen ? "bg-[#1F2023]" : "hover:bg-[#1A1B1E]")}>
                <span className={cn("mt-[11px] h-[7px] w-[7px] shrink-0 rounded-full", g.unread ? "bg-[#2490EF]" : "bg-transparent")} />
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[#111214]" style={{ background: avatarTint(actor) }}>{initials(actor)}</span>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setOpenKey(isOpen ? null : g.key)} className="block w-full text-left">
                    <span className="block text-[13px] leading-snug">
                      <b className="font-semibold">{n.actor ?? (isDailyReminder(n) ? "Daily reminder" : "COS")}</b>{" "}
                      <span className="text-[#A3A6AB]">{VERB[n.kind] ?? "updated"}</span>{" "}
                      {n.taskCode && <span className="st-mono rounded-[5px] bg-[#26282C] px-1.5 py-px text-[11px] text-[#E6E6E3]">{n.taskCode}</span>}
                      {notifLane(n) === "needs-you" && <span className="ml-1.5 rounded-[5px] bg-[#3A1D2E] px-1.5 py-px text-[10px] text-[#F07BBE]">needs you</span>}
                    </span>
                    <span className={cn("mt-0.5 block text-xs leading-relaxed text-[#A3A6AB]", isOpen ? "" : "line-clamp-2")}>{task}</span>
                    <span className="mt-1 block text-[11px] text-[#6E7177]">{notifAgo(n.createdAt)}{g.count > 1 ? ` · ${g.count} of these` : ""}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => onOpen(g)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#F2F2F0] px-2.5 text-[11px] font-medium text-[#111214]">Open</button>
                      {n.taskCode && <button type="button" onClick={() => onReply(g)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#34363B] px-2.5 text-[11px] text-[#E6E6E3]"><CornerUpLeft size={11} />Reply</button>}
                      {g.unread > 0 && <button type="button" onClick={() => onRead(g)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#34363B] px-2.5 text-[11px] text-[#E6E6E3]"><Check size={11} />Mark read</button>}
                      <button type="button" onClick={() => { onDismiss(g); setOpenKey(null); }} className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#34363B] px-2.5 text-[11px] text-[#A3A6AB]"><X size={11} />Dismiss</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-[#26282C] px-1 pt-2.5 text-[11px] text-[#6E7177]">
        <span>Read notifications clear themselves after 14 days</span>
        <Link href="/activity" onClick={onClose} className="text-[#C9CBCF] hover:text-white">See everything in Activity →</Link>
      </div>
    </div>
  );
}
