"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Bell, CornerUpLeft, Pin, UserPlus } from "lucide-react";

type Notif = {
  id: number;
  kind: "mention" | "reply" | "pinned" | "assigned";
  taskCode: string | null;
  title: string;
  body: string | null;
  actor: string | null;
  createdAt: string;
  readAt: string | null;
};

const ICON = { mention: AtSign, reply: CornerUpLeft, pinned: Pin, assigned: UserPlus };

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** The notifications bell — polls the count, opens a list, marks read on open.
 *  Used in both pills; `to` is the base path for task links ("/portal/task"
 *  for staff, "/task" for the owner). */
export function NotificationBell({ to }: { to: "/portal/task" | "/task" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number; items: Notif[] };
      setCount(data.count);
      setItems(data.items);
    } catch {
      /* offline blip */
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      setCount(0);
      try {
        await fetch("/api/notifications?action=read", { method: "POST" });
      } catch {
        /* best effort */
      }
    }
  }

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

      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl glass elevated ring-1 ring-border shadow-pill overflow-hidden z-50">
          <div className="px-3.5 py-2.5 border-b border-border text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Notifications
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-sm text-fg-muted">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => {
                const Icon = ICON[n.kind] ?? Bell;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (n.taskCode) router.push(`${to}/${n.taskCode}`);
                    }}
                    className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-bg-muted/60 transition-colors border-b border-border/50 ${
                      n.readAt ? "" : "bg-accent-soft/30"
                    }`}
                  >
                    <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                      <Icon size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{n.title}</span>
                      {n.body && <span className="block text-xs text-fg-muted truncate">{n.body}</span>}
                      <span className="block text-[11px] text-fg-subtle mt-0.5">
                        {n.taskCode ? `${n.taskCode} · ` : ""}{ago(n.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
