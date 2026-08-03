"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  CornerUpLeft,
  Megaphone,
  MessageCircle,
  MessageSquarePlus,
  Pin,
  RefreshCw,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { useAnchored } from "@/lib/use-anchored";
import {
  groupNotifications,
  isDailyReminder,
  isSystemDigest,
  notifBucket,
  notifLane,
  notifSubject,
  type NotifGroup,
  type NotifRow,
} from "@/lib/notification-view";

const ICON: Record<string, typeof Bell> = {
  mention: AtSign,
  reply: CornerUpLeft,
  pinned: Pin,
  assigned: UserPlus,
  update: MessageSquarePlus,
  chat: MessageCircle,
  chat_mention: AtSign,
  leave: CalendarClock,
  announcement: Megaphone,
  meeting: CalendarClock,
};

function iconFor(n: NotifRow): typeof Bell {
  if (isSystemDigest(n)) return Sparkles;
  if (isDailyReminder(n)) return RefreshCw;
  return ICON[n.kind] ?? Bell;
}

/** Reflect the unread count onto the installed-app (home-screen) icon badge. */
function setAppBadge(n: number) {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (n > 0) nav.setAppBadge?.(n);
    else nav.clearAppBadge?.();
  } catch {
    /* unsupported */
  }
}

type Lane = "needs-you" | "activity";

/**
 * The notifications bell. Rebuilt (Aug 2026) around two lanes rather than five
 * mostly-empty categories, with the task name leading each row instead of the
 * boilerplate sentence. Filing, hierarchy and repeat-collapsing all live in the
 * pure `lib/notification-view` module, which is unit-tested.
 */
export function NotificationBell({
  to,
  align = "right",
  lanes: showLanes = false,
}: {
  to: "/portal/task" | "/task";
  align?: "left" | "right";
  /** Split into "Needs you" / "Activity". Command centre only — for portal
   *  users 90%+ of rows are activity, so tabs just hide their work behind a
   *  click. They get one plain list instead. */
  lanes?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [lane, setLane] = useState<Lane>("needs-you");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);
  // The panel is PORTALLED to <body>, so it isn't inside `ref`. Without its own
  // ref, the outside-click handler treated every click in the panel — tabs,
  // "Mark all read", expanding a group — as an outside click and shut it.
  const panelRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchored(ref, open, 460);

  async function refresh() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number; items: NotifRow[] };
      setCount(data.count);
      setItems(data.items);
      setAppBadge(data.count);
    } catch {
      /* offline blip */
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    const onFocus = () => refresh();
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "cos-notification") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const insideTrigger = ref.current?.contains(t);
      const insidePanel = panelRef.current?.contains(t);
      if (!insideTrigger && !insidePanel) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const lanes = useMemo(() => {
    const needs = items.filter((n) => notifLane(n) === "needs-you");
    const activity = items.filter((n) => notifLane(n) === "activity");
    return {
      "needs-you": groupNotifications(needs),
      activity: groupNotifications(activity),
      all: groupNotifications(items),
      needsUnread: needs.filter((n) => !n.readAt).length,
      activityUnread: activity.filter((n) => !n.readAt).length,
    };
  }, [items]);

  // Open on whichever lane actually wants attention.
  function toggle() {
    const next = !open;
    if (next && showLanes) {
      setLane(lanes.needsUnread > 0 || lanes["needs-you"].length > 0 ? "needs-you" : "activity");
    }
    setOpen(next);
  }

  /** Mark just this group read — glancing at the panel no longer clears everything. */
  async function markGroupRead(g: NotifGroup) {
    const ids = g.items.filter((n) => !n.readAt).map((n) => n.id);
    if (ids.length === 0) return;
    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, readAt: stamp } : n)));
    setCount((c) => Math.max(0, c - ids.length));
    setAppBadge(Math.max(0, count - ids.length));
    try {
      await fetch(`/api/notifications?action=read&ids=${ids.join(",")}`, { method: "POST" });
    } catch {
      /* best effort */
    }
  }

  async function markAllRead() {
    const stamp = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: stamp })));
    setCount(0);
    setAppBadge(0);
    try {
      await fetch("/api/notifications?action=read", { method: "POST" });
    } catch {
      /* best effort */
    }
  }

  function navigateTo(n: NotifRow) {
    setOpen(false);
    if ((n.kind === "chat" || n.kind === "chat_mention") && n.threadId) {
      const chatBase = to.startsWith("/portal") ? "/portal/chat" : "/chat";
      router.push(`${chatBase}/${n.threadId}`);
    } else if (n.kind === "meeting") {
      router.push(to.startsWith("/portal") ? "/portal/meetings" : "/calendar");
    } else if (n.taskCode) {
      if (to === "/task" && pathname && !pathname.startsWith("/portal")) {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.set("task", n.taskCode);
        params.delete("person");
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      } else {
        router.push(`${to}/${n.taskCode}`);
      }
    }
  }

  async function openGroup(g: NotifGroup) {
    await markGroupRead(g);
    navigateTo(g.lead);
  }

  async function dismissGroup(g: NotifGroup) {
    const ids = g.items.map((n) => n.id);
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/notifications?action=dismiss&id=${id}`, { method: "POST" }))
      );
    } catch {
      /* best effort */
    }
  }

  async function clearAll() {
    setItems([]);
    setCount(0);
    setAppBadge(0);
    try {
      await fetch("/api/notifications?action=clear", { method: "POST" });
    } catch {
      /* best effort */
    }
  }

  const anchorStyle: React.CSSProperties = (() => {
    if (!anchor) return { top: "-9999px", left: "-9999px" };
    const GAP = 8;
    const margin = 12;
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const panelW = Math.min(360, vw - margin * 2);
    let left = align === "left" ? anchor.left : anchor.left + anchor.width - panelW;
    left = Math.max(margin, Math.min(left, vw - panelW - margin));
    const style: React.CSSProperties = { left };
    if (anchor.openUp) style.bottom = Math.max(margin, vh - anchor.top + GAP);
    else style.top = anchor.top + GAP;
    return style;
  })();

  // Portals get one plain list; only the command centre splits into lanes.
  const groups = showLanes ? lanes[lane] : lanes.all;
  const laneUnread = showLanes ? (lane === "needs-you" ? lanes.needsUnread : lanes.activityUnread) : count;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        title="Notifications"
        className="relative inline-flex items-center justify-center h-8 w-8 rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg transition-colors"
      >
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-danger text-white text-[9px] font-bold leading-[15px] text-center tabular">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-[1px]"
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Notifications"
              style={anchorStyle}
              className="fixed w-[22.5rem] max-w-[calc(100vw-1.5rem)] rounded-3xl glass-menu elevated ring-1 ring-border shadow-pill overflow-hidden z-[60]"
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-sm font-medium">Notifications</span>
                <div className="flex items-center gap-1">
                  {laneUnread > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-fg-muted hover:text-accent hover:bg-accent-soft/60 transition-colors"
                    >
                      <CheckCheck size={12} /> Mark all read
                    </button>
                  )}
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAll}
                      aria-label="Clear all notifications"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Two lanes: what wants something from you, and what's just news. */}
              {showLanes && (
              <div className="flex gap-1.5 px-4 pb-2.5">
                {(
                  [
                    ["needs-you", "Needs you", lanes["needs-you"].length, lanes.needsUnread],
                    ["activity", "Activity", lanes.activity.length, lanes.activityUnread],
                  ] as const
                ).map(([key, label, total, unread]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLane(key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      lane === key ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-muted/70 hover:text-fg"
                    }`}
                  >
                    {label}
                    {(unread || total) > 0 && (
                      <span className={`tabular ${lane === key ? "opacity-80" : "text-fg-subtle"}`}>
                        {unread > 0 ? unread : total}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              )}

              <div
                className={`overflow-y-auto overscroll-contain border-t border-border/70 ${showLanes ? "" : "mt-1"}`}
                style={{ maxHeight: anchor ? Math.max(180, anchor.maxHeight - 96) : undefined }}
              >
                {groups.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <span className="h-10 w-10 rounded-full bg-bg-muted flex items-center justify-center text-fg-subtle">
                      <Check size={18} />
                    </span>
                    <p className="text-sm text-fg-muted">
                      {!showLanes ? "You're all caught up." : lane === "needs-you" ? "Nothing needs you." : "No recent activity."}
                    </p>
                  </div>
                ) : (
                  groups.map((g, i) => {
                    const bucket = notifBucket(g.lead.createdAt);
                    const prevBucket = i > 0 ? notifBucket(groups[i - 1].lead.createdAt) : null;
                    return (
                      <div key={g.key}>
                        {bucket !== prevBucket && (
                          <div className="px-4 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
                            {bucket}
                          </div>
                        )}
                        <NotifGroupRow
                          g={g}
                          expanded={!!expanded[g.key]}
                          onToggleExpand={() => setExpanded((e) => ({ ...e, [g.key]: !e[g.key] }))}
                          onOpen={() => openGroup(g)}
                          onDismiss={() => dismissGroup(g)}
                        />
                      </div>
                    );
                  })
                )}
              </div>

              {items.length > 0 && (
                <div className="border-t border-border/70 px-4 py-2 text-center text-[11px] text-fg-subtle">
                  Read notifications clear themselves after 14 days
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

/** One row — a single notification, or a collapsed burst of identical ones. */
function NotifGroupRow({
  g,
  expanded,
  onToggleExpand,
  onOpen,
  onDismiss,
}: {
  g: NotifGroup;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const CLEAR_W = 76;
  const { offset, dragging, bind, reset } = useSwipeRow({ rightWidth: CLEAR_W });
  const Icon = iconFor(g.lead);
  const { headline, meta } = notifSubject(g.lead);
  const unread = g.unread > 0;

  return (
    <div className="relative overflow-hidden border-b border-border/50 last:border-b-0">
      <button
        type="button"
        aria-label="Clear notification"
        onClick={onDismiss}
        className="absolute inset-y-0 right-0 flex items-center justify-center gap-1 bg-danger text-white text-xs font-medium"
        style={{ width: CLEAR_W }}
      >
        <Trash2 size={14} />
        Clear
      </button>

      <div
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform .2s ease" }}
        className={`relative group ${unread ? "bg-accent-soft" : "bg-[hsl(var(--bg-elev))]"}`}
      >
        <button
          type="button"
          {...bind}
          onClick={() => {
            if (offset !== 0) {
              reset();
              return;
            }
            onOpen();
          }}
          className="flex w-full touch-pan-y items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-muted/60 active:bg-bg-muted"
        >
          {unread && (
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          )}
          <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent-soft text-accent flex items-center justify-center">
            <Icon size={13} />
          </span>
          <span className="min-w-0 flex-1">
            {/* The subject leads; who did what is the quiet line beneath. */}
            <span className="block text-[13px] font-medium leading-snug line-clamp-2">{headline}</span>
            <span className="block text-[11px] text-fg-muted mt-0.5">
              {g.count > 1 ? `${g.count} updates · ` : ""}
              {meta}
            </span>
          </span>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear notification"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="hidden md:flex shrink-0 h-6 w-6 items-center justify-center rounded-full text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger transition"
          >
            <X size={13} />
          </span>
        </button>

        {/* A collapsed burst can be opened out rather than hidden entirely. */}
        {g.count > 1 && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex w-full items-center gap-1 px-4 pb-2 pl-[3.4rem] text-[11px] font-medium text-fg-subtle hover:text-fg transition-colors"
          >
            <ChevronDown size={12} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
            {expanded ? "Hide" : `Show all ${g.count}`}
          </button>
        )}
        {expanded &&
          g.items.slice(1).map((n) => {
            const s = notifSubject(n);
            return (
              <div key={n.id} className="px-4 pb-2 pl-[3.4rem] text-[11px] text-fg-muted">
                <span className="block truncate">{s.headline}</span>
                <span className="block text-fg-subtle">{s.meta}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
