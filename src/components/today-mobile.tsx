"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { Check, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import type { AttnItem } from "./attention-panel";

type Tone = "danger" | "warn" | "muted";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function deadlineLabel(ts: number | null): { text: string; tone: Tone } {
  if (ts == null) return { text: "No deadline", tone: "muted" };
  const days = Math.round((startOfDay(ts) - startOfDay(Date.now())) / 86400000);
  if (days < 0) return { text: `${-days}d overdue`, tone: "danger" };
  if (days === 0) return { text: "Due today", tone: "warn" };
  if (days === 1) return { text: "Due tomorrow", tone: "warn" };
  if (days <= 7) return { text: `Due in ${days}d`, tone: "warn" };
  return { text: new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tone: "muted" };
}

const stripeColor: Record<Tone, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  muted: "bg-border",
};
const toneText: Record<Tone, string> = {
  danger: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
  muted: "text-fg-muted",
};

function flagTone(f: string): Tone {
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  return "muted";
}

/** A single swipeable card. Swipe right to complete; tap to open the drawer. */
function SwipeCard({
  t,
  onOpen,
  onComplete,
}: {
  t: AttnItem;
  onOpen: () => void;
  onComplete: () => Promise<boolean>;
}) {
  const x = useMotionValue(0);
  const [busy, setBusy] = useState(false);
  const dragged = useRef(false);
  // Green "complete" backdrop fades in as the card slides right.
  const bgOpacity = useTransform(x, [0, 120], [0, 1]);

  const stripe = flagTone(t.flag);
  const dl = deadlineLabel(t.deadlineTs);

  async function handleDragEnd(_: unknown, info: { offset: { x: number }; velocity: { x: number } }) {
    const far = info.offset.x > 120 || (info.offset.x > 70 && info.velocity.x > 250);
    if (!far) return;
    setBusy(true);
    const ok = await onComplete();
    if (!ok) setBusy(false); // snap back handled by animate prop
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Reveal layer behind the card */}
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 bg-emerald-500/15 flex items-center pl-5 text-emerald-600 dark:text-emerald-400"
      >
        <CheckCircle2 size={22} />
        <span className="ml-2 text-sm font-medium">Complete</span>
      </motion.div>

      <motion.div
        drag={busy ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.04, right: 0.7 }}
        style={{ x }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onOpen();
        }}
        className="relative bg-bg-elev border border-border rounded-2xl pl-4 pr-4 py-3.5 active:scale-[0.99] transition-transform"
      >
        <span className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${stripeColor[stripe]}`} />
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-mono text-fg-muted">{t.code}</span>
          <span className="ml-auto text-[11px] rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted">{t.status}</span>
        </div>
        <p className="text-[15px] font-medium leading-snug line-clamp-2">{t.actionItem}</p>
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted mt-2">
          <span className="truncate">{t.companyName}</span>
          <span className={`shrink-0 font-medium ${toneText[dl.tone]}`}>{dl.text}</span>
        </div>

        {busy && (
          <div className="absolute inset-0 bg-bg-elev/70 flex items-center justify-center rounded-2xl">
            <Loader2 size={18} className="animate-spin text-emerald-600" />
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function TodayMobile({ items }: { items: AttnItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { toast } = useToast();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const visible = items.filter((t) => !done.has(t.code));

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function complete(t: AttnItem): Promise<boolean> {
    try {
      const res = await inlineUpdateTask(t.code, "status", "Completed");
      if (res.ok) {
        setDone((prev) => new Set(prev).add(t.code));
        toast(`${t.code} marked complete`, {
          tone: "success",
          duration: 6000,
          action: {
            label: "Undo",
            onClick: async () => {
              if (res.undoToken) await callUndo(res.undoToken);
              setDone((prev) => {
                const next = new Set(prev);
                next.delete(t.code);
                return next;
              });
              router.refresh();
            },
          },
        });
        return true;
      }
      toast(res.error || "Could not complete", { tone: "warn", duration: 3000 });
      return false;
    } catch {
      toast("Network error", { tone: "warn", duration: 3000 });
      return false;
    }
  }

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 700);
  }

  return (
    <section className="sm:hidden space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          Today {visible.length > 0 && <span className="text-fg-subtle">· {visible.length}</span>}
        </p>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted active:text-accent px-2 py-1 -mr-2"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-subtle py-10 text-center">
          <Check size={26} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-fg-muted">Nothing needs you right now.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {visible.map((t) => (
                <motion.div
                  key={t.code}
                  layout
                  exit={{ x: 400, opacity: 0, transition: { duration: 0.22 } }}
                >
                  <SwipeCard t={t} onOpen={() => openTask(t.code)} onComplete={() => complete(t)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <p className="text-center text-[11px] text-fg-subtle pt-1">Tap to open · swipe right to complete</p>
        </>
      )}
    </section>
  );
}
