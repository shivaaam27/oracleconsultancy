"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, X, ChevronRight } from "lucide-react";

/* A calm, dismissible announcement banner shown at the top of the board / home
 * (like the administrator). Surfaces the newest announcement still needing the
 * viewer's attention; "Open" jumps to the Announcements tab on Briefings, and the
 * × dismisses it locally (remembered in localStorage so it doesn't nag on every
 * navigation — the full item still lives on the Announcements tab). */

const KEY = "cos.dismissedAnnouncements";
type Item = { id: number; title: string; body: string | null };

export function AnnouncementBanner({ items }: { items: Item[] }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* ignore */ }
    setReady(true);
  }, []);

  if (!ready) return null;
  const top = items.find((a) => !dismissed.includes(a.id));
  if (!top) return null;

  const open = () => router.push("/portal/meetings?tab=announcements");
  const close = () => {
    const next = [...dismissed, top.id];
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next.slice(-100))); } catch { /* ignore */ }
  };

  return (
    <div className="print-hidden flex items-center gap-3 rounded-2xl border border-accent/25 bg-gradient-to-r from-accent-soft to-bg-elev px-3.5 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg"><Megaphone size={15} /></span>
      <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
        <p className="truncate text-base font-semibold">{top.title}</p>
        {top.body && <p className="truncate text-xs text-fg-muted">{top.body}</p>}
      </button>
      <button
        type="button"
        onClick={open}
        className="hidden shrink-0 items-center gap-1 rounded-full bg-bg-elev px-3 py-1.5 text-sm font-medium text-accent ring-1 ring-accent/25 transition-colors hover:bg-accent-soft sm:inline-flex"
      >
        Open <ChevronRight size={13} />
      </button>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={close}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
      >
        <X size={15} />
      </button>
    </div>
  );
}
