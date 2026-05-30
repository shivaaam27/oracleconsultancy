"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, ChevronDown } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { Pill, type PillTone } from "./macos";
import { SwipeRow } from "./swipe-row";
import { spring } from "@/lib/motion";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask, setTaskArchived, deleteTaskQuick } from "@/app/task/actions";
import type { SwipeAction } from "@/lib/settings";
import type { AttnItem } from "./attention-panel";

const SWIPE_LABEL: Record<SwipeAction, string> = {
  none: "", complete: "Complete", escalate: "Escalate", snooze: "Snooze",
  archive: "Archive", delete: "Delete", open: "Open", update: "Update",
};

function startOfDay(ts: number) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

function deadlineLabel(ts: number | null): { text: string; tone: PillTone } {
  if (ts == null) return { text: "No date", tone: "neutral" };
  const days = Math.round((startOfDay(ts) - startOfDay(Date.now())) / 86400000);
  if (days < 0) return { text: `${-days}d overdue`, tone: "danger" };
  if (days === 0) return { text: "Today", tone: "warn" };
  if (days === 1) return { text: "Tomorrow", tone: "warn" };
  if (days <= 7) return { text: `${days}d`, tone: "warn" };
  return { text: new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tone: "neutral" };
}

function statusTone(s: string): PillTone {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "neutral";
}

function dotColor(flag: string): string {
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(flag)) return "bg-danger";
  if (["due-soon", "no-deadline", "aging"].includes(flag)) return "bg-warn";
  return "bg-fg-subtle";
}

export function AttentionList({
  items: initial,
  swipeRight = "complete",
  swipeLeft = "escalate",
}: {
  items: AttnItem[];
  swipeRight?: SwipeAction;
  swipeLeft?: SwipeAction;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [items, setItems] = useState<AttnItem[]>(initial);
  const [collapsed, setCollapsed] = useState(false);

  // Remember the collapsed state across visits.
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("aumio.attn.collapsed") === "1"); } catch { /* ignore */ }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("aumio.attn.collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  function open(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function remove(code: string) {
    setItems((prev) => prev.filter((x) => x.code !== code));
  }

  function undoToast(msg: string, undo: () => Promise<unknown>) {
    toast(msg, { tone: "success", duration: 6000, action: { label: "Undo", onClick: async () => { await undo(); router.refresh(); } } });
  }

  // Runs the configured swipe action for a row. Effective per Settings.
  async function runAction(action: SwipeAction, t: AttnItem) {
    if (action === "open") { router.push(`/task/${t.code}`); return; }
    if (action === "update") { open(t.code); return; }
    if (action === "none") return;

    if (action === "complete") {
      const res = await inlineUpdateTask(t.code, "status", "Completed");
      if (res.ok) { remove(t.code); if (res.undoToken) undoToast(`${t.code} completed`, () => callUndo(res.undoToken!)); }
      else toast(res.error || "Failed", { tone: "warn", duration: 3000 });
    } else if (action === "escalate") {
      const res = await inlineUpdateTask(t.code, "escalation", "Yes");
      if (res.ok) { if (res.undoToken) undoToast(`${t.code} escalated`, () => callUndo(res.undoToken!)); router.refresh(); }
      else toast(res.error || "Failed", { tone: "warn", duration: 3000 });
    } else if (action === "snooze") {
      const base = t.deadlineTs ?? Date.now();
      const next = new Date(base + 7 * 86400000).toISOString();
      const res = await inlineUpdateTask(t.code, "deadline", next);
      if (res.ok) { remove(t.code); if (res.undoToken) undoToast(`${t.code} snoozed 1 week`, () => callUndo(res.undoToken!)); }
      else toast(res.error || "Failed", { tone: "warn", duration: 3000 });
    } else if (action === "archive") {
      const res = await setTaskArchived(t.code, true);
      if (res.ok) { remove(t.code); undoToast(`${t.code} archived`, async () => { await setTaskArchived(t.code, false); }); }
      else toast(res.error || "Failed", { tone: "warn", duration: 3000 });
    } else if (action === "delete") {
      const res = await deleteTaskQuick(t.code);
      if (res.ok) { remove(t.code); if (res.undoToken) undoToast(`${t.code} deleted`, () => callUndo(res.undoToken!)); }
      else toast(res.error || "Failed", { tone: "warn", duration: 3000 });
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={toggleCollapsed}
          disabled={items.length === 0}
          aria-expanded={!collapsed}
          className="group inline-flex items-center gap-1.5 text-sm font-semibold tracking-tight disabled:cursor-default"
        >
          Attention today
          {items.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-danger-soft/70 text-danger text-[11px] font-semibold tabular">
              {items.length}
            </span>
          )}
          {items.length > 0 && (
            <ChevronDown size={15} className={cn("text-fg-subtle transition-transform group-hover:text-fg", collapsed && "-rotate-90")} />
          )}
        </button>
        <Link href="/?tab=tasks&all=1" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors">
          All tasks <ArrowRight size={12} />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="glass elevated rounded-2xl py-12 text-center">
          <CheckCircle2 size={26} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-fg-muted">Nothing needs you right now.</p>
        </div>
      ) : collapsed ? null : (
        <>
          <div className="glass elevated rounded-2xl overflow-hidden">
            {items.map((t, i) => {
              const dl = deadlineLabel(t.deadlineTs);
              return (
                <motion.div
                  key={t.code}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ ...spring, delay: Math.min(i * 0.028, 0.36) }}
                >
                  <SwipeRow
                    onTap={() => open(t.code)}
                    onSwipeRight={swipeRight === "none" ? undefined : () => runAction(swipeRight, t)}
                    onSwipeLeft={swipeLeft === "none" ? undefined : () => runAction(swipeLeft, t)}
                    rightLabel={SWIPE_LABEL[swipeRight]}
                    leftLabel={SWIPE_LABEL[swipeLeft]}
                  >
                    <div className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-bg-muted/50 transition-colors cursor-pointer border-b border-border/60">
                      {/* Identity cluster — dot + code + status merged, no dead columns */}
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={cn("w-1.5 h-1.5 rounded-full", dotColor(t.flag))} />
                        <span className="font-mono text-[11px] text-fg-muted">{t.code}</span>
                        <Pill tone={statusTone(t.status)} className="hidden sm:inline-flex">{t.status}</Pill>
                      </span>
                      {/* Title flex-grows to fill the row (removes web negative space) */}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{t.actionItem}</span>
                        <span className="block truncate text-[11px] text-fg-muted md:hidden">{t.companyName}</span>
                      </span>
                      {/* Company — inline on wider screens where there's room */}
                      <span className="hidden md:block truncate text-[11px] text-fg-muted max-w-[140px] shrink-0">{t.companyName}</span>
                      {/* Deadline — right anchor */}
                      <span className={cn("text-[11px] font-medium shrink-0 text-right tabular",
                        dl.tone === "danger" ? "text-red-600 dark:text-red-400" : dl.tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-fg-muted")}>
                        {dl.text}
                      </span>
                    </div>
                  </SwipeRow>
                </motion.div>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-fg-subtle">
            Tap to open
            {swipeRight !== "none" && <> · swipe right to {SWIPE_LABEL[swipeRight].toLowerCase()}</>}
            {swipeLeft !== "none" && <> · left to {SWIPE_LABEL[swipeLeft].toLowerCase()}</>}
          </p>
        </>
      )}
    </section>
  );
}
