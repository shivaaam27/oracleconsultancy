"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  AtSign,
  Bell,
  CalendarClock,
  ChevronDown,
  CornerUpLeft,
  Megaphone,
  MessageCircle,
  MessageSquarePlus,
  MessageSquareText,
  Pin,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { useAnchored } from "@/lib/use-anchored";

type NotifKind =
  | "mention"
  | "reply"
  | "pinned"
  | "assigned"
  | "update"
  | "chat"
  | "chat_mention"
  | "leave"
  | "announcement"
  | "request"
  | "meeting";

type Notif = {
  id: number;
  kind: NotifKind;
  taskCode: string | null;
  threadId: number | null;
  requestId: number | null;
  title: string;
  body: string | null;
  actor: string | null;
  createdAt: string;
  readAt: string | null;
};

const ICON: Record<NotifKind, typeof Bell> = {
  mention: AtSign,
  reply: CornerUpLeft,
  pinned: Pin,
  assigned: UserPlus,
  update: MessageSquarePlus,
  chat: MessageCircle,
  chat_mention: AtSign,
  leave: CalendarClock,
  announcement: Megaphone,
  request: MessageSquareText,
  meeting: CalendarClock,
};

/** Notifications are grouped into a few human categories (iPhone-style stacks).
 *  Order here is the display order. */
const CATEGORIES: { key: string; label: string; kinds: NotifKind[]; icon: typeof Bell }[] = [
  { key: "messages", label: "Messages", kinds: ["chat", "chat_mention", "mention", "reply"], icon: MessageCircle },
  { key: "tasks", label: "Tasks", kinds: ["assigned", "pinned", "update"], icon: UserPlus },
  { key: "requests", label: "Requests & leave", kinds: ["request", "leave"], icon: MessageSquareText },
  { key: "meetings", label: "Meetings", kinds: ["meeting"], icon: CalendarClock },
  { key: "announcements", label: "Announcements", kinds: ["announcement"], icon: Megaphone },
];

function categoryOf(kind: NotifKind): string {
  return CATEGORIES.find((c) => c.kinds.includes(kind))?.key ?? "messages";
}

/** Reflect the unread count onto the installed-app (home-screen) icon badge.
 *  Works on Android (Chrome), desktop PWAs, and iOS 16.4+ when installed to the
 *  Home Screen; a silent no-op everywhere else. */
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

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** The notifications bell — keeps the count in near real-time (poll + tab focus
 *  + a service-worker ping when a push lands), opens a grouped list, and lets
 *  you clear items (swipe on mobile, hover ✕ on desktop) or clear all. Used in
 *  both pills; `to` is the base path for task links. */
export function NotificationBell({
  to,
  align = "right",
}: {
  to: "/portal/task" | "/task";
  /** Which edge the desktop dropdown anchors to (the bell now lives at the top
   *  of the page: top-left in the portal header → "left", top-right floating on
   *  the admin side → "right"). */
  align?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);
  // Viewport-aware placement: the panel is portalled to <body> as a fixed box so
  // it never clips below the screen (it flips ABOVE the bell when room is tight —
  // crucial for the admin bottom pill, where downward = off-screen).
  const anchor = useAnchored(ref, open, 420);

  async function refresh() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number; items: Notif[] };
      setCount(data.count);
      setItems(data.items);
      setAppBadge(data.count);
    } catch {
      /* offline blip */
    }
  }

  // Near real-time: poll while visible, refresh on focus/visibility regain, and
  // refresh immediately when the service worker reports an incoming push.
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
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

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      setCount(0);
      setAppBadge(0);
      try {
        await fetch("/api/notifications?action=read", { method: "POST" });
      } catch {
        /* best effort */
      }
    }
  }

  function navigateTo(n: Notif) {
    setOpen(false);
    if ((n.kind === "chat" || n.kind === "chat_mention") && n.threadId) {
      const chatBase = to.startsWith("/portal") ? "/portal/chat" : "/chat";
      router.push(`${chatBase}/${n.threadId}`);
    } else if (n.kind === "request" && n.requestId) {
      const base = to.startsWith("/portal") ? "/portal/requests" : "/requests";
      router.push(`${base}/${n.requestId}`);
    } else if (n.kind === "meeting") {
      router.push(to.startsWith("/portal") ? "/portal/meetings" : "/calendar");
    } else if (n.taskCode) {
      // On the admin side, open the task in place via the `?task=CODE` drawer
      // rather than the `/task/[code]` redirect stub. The portal keeps its page.
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

  async function dismiss(id: number) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch(`/api/notifications?action=dismiss&id=${id}`, { method: "POST" });
    } catch {
      /* best effort */
    }
  }

  async function clearAll() {
    setItems([]);
    setCount(0);
    try {
      await fetch("/api/notifications?action=clear", { method: "POST" });
    } catch {
      /* best effort */
    }
  }

  // Group items into the categories that actually have content, preserving order.
  const groups = useMemo(() => {
    return CATEGORIES.map((c) => ({
      ...c,
      items: items.filter((n) => categoryOf(n.kind) === c.key),
    })).filter((g) => g.items.length > 0);
  }, [items]);

  // Turn the anchor box into a fixed-position style: align the panel's left/right
  // edge to the matching trigger edge (clamped into the viewport), and anchor by
  // `top` when opening down or `bottom` when flipping up.
  const anchorStyle: React.CSSProperties = (() => {
    if (!anchor) return { top: "-9999px", left: "-9999px" };
    const GAP = 8;
    const margin = 12;
    const vw = typeof window !== "undefined" ? window.innerWidth : 0;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    const panelW = Math.min(336, vw - margin * 2); // 21rem, capped to the viewport
    // Anchor the chosen edge to the bell, then clamp so the panel stays on-screen.
    let left = align === "left" ? anchor.left : anchor.left + anchor.width - panelW;
    left = Math.max(margin, Math.min(left, vw - panelW - margin));
    const style: React.CSSProperties = { left };
    if (anchor.openUp) style.bottom = Math.max(margin, vh - anchor.top + GAP);
    else style.top = anchor.top + GAP;
    return style;
  })();

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
            {/* Scrim — tap-to-close target; also dims behind the floating panel. */}
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-[1px]"
            />
            <div
              role="dialog"
              aria-label="Notifications"
              style={anchorStyle}
              className={
                // Portalled, viewport-aware fixed box (never clips below the screen;
                // flips above the bell when there isn't room below — see useAnchored).
                "fixed w-[21rem] max-w-[calc(100vw-1.5rem)] " +
                // glass-menu = firmer (less see-through) fill than chrome glass.
                "rounded-3xl glass-menu elevated ring-1 ring-border shadow-pill overflow-hidden z-[60]"
              }
            >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Notifications</span>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 size={12} /> Clear all
                </button>
              )}
            </div>

            <div
              className="overflow-y-auto overscroll-contain"
              style={{ maxHeight: anchor ? Math.max(160, anchor.maxHeight - 44) : undefined }}
            >
              {groups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="h-10 w-10 rounded-full bg-bg-muted flex items-center justify-center text-fg-subtle">
                    <Bell size={18} />
                  </span>
                  <p className="text-sm text-fg-muted">You&apos;re all caught up.</p>
                </div>
              ) : (
                groups.map((g) => {
                  const isCollapsed = collapsed[g.key];
                  const unread = g.items.filter((n) => !n.readAt).length;
                  return (
                    <section key={g.key}>
                      <button
                        type="button"
                        onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                        className="sticky top-0 z-10 flex w-full items-center gap-2 bg-bg-subtle/80 backdrop-blur px-4 py-1.5 text-left border-b border-border/60"
                      >
                        <g.icon size={12} className="text-fg-subtle shrink-0" />
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                          {g.label}
                        </span>
                        {unread > 0 && (
                          <span className="rounded-full bg-accent-soft text-accent text-[10px] font-semibold px-1.5 leading-[16px]">
                            {unread}
                          </span>
                        )}
                        <ChevronDown
                          size={14}
                          className={`ml-auto text-fg-subtle transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                        />
                      </button>
                      {!isCollapsed &&
                        g.items.map((n) => (
                          <NotifRow key={n.id} n={n} onOpen={() => navigateTo(n)} onDismiss={() => dismiss(n.id)} />
                        ))}
                    </section>
                  );
                })
              )}
            </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

/** One notification row. On mobile it swipes left to reveal a red Clear action
 *  (iPhone-style); on desktop a ✕ appears on hover. */
function NotifRow({ n, onOpen, onDismiss }: { n: Notif; onOpen: () => void; onDismiss: () => void }) {
  const CLEAR_W = 76;
  const { offset, dragging, bind, reset } = useSwipeRow({ rightWidth: CLEAR_W });
  const Icon = ICON[n.kind] ?? Bell;

  // Rows rest at translate 0 (no half-open peek). The Clear action is revealed
  // only by an actual finger swipe; desktop keeps its hover-✕ instead.
  const tx = offset;

  return (
    <div className="relative overflow-hidden border-b border-border/50 last:border-b-0">
      {/* Revealed action behind the row */}
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
        style={{ transform: `translateX(${tx}px)`, transition: dragging ? "none" : "transform .2s ease" }}
        className={`relative flex w-full touch-pan-y items-start gap-3 px-4 py-2.5 text-left transition-colors group hover:bg-bg-muted active:bg-bg-muted ${
          // Unread tint MUST be opaque — a translucent row lets the red "Clear"
          // action behind it bleed through at rest (it looked half-swiped). Use the
          // solid accent-soft, and make it the row's only base bg (no class clash).
          n.readAt ? "bg-[hsl(var(--bg-elev))]" : "bg-accent-soft"
        }`}
      >
        {!n.readAt && (
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
        )}
        <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent-soft text-accent flex items-center justify-center">
          <Icon size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-snug">{n.title}</span>
          {n.body && <span className="block text-xs text-fg-muted truncate">{n.body}</span>}
          <span className="block text-[11px] text-fg-subtle mt-0.5">
            {n.taskCode ? `${n.taskCode} · ` : ""}
            {ago(n.createdAt)}
          </span>
        </span>
        {/* Desktop hover-to-dismiss */}
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
          <Trash2 size={13} />
        </span>
      </button>
    </div>
  );
}
