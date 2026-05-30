"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Pill, type PillTone } from "./macos";
import { SwipeRow } from "./swipe-row";
import { spring } from "@/lib/motion";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import type { AttnItem } from "./attention-panel";

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

export function AttentionList({ items: initial }: { items: AttnItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [items, setItems] = useState<AttnItem[]>(initial);

  function open(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function remove(code: string) {
    setItems((prev) => prev.filter((x) => x.code !== code));
  }

  async function complete(t: AttnItem) {
    const res = await inlineUpdateTask(t.code, "status", "Completed");
    if (res.ok) {
      remove(t.code);
      toast(`${t.code} completed`, {
        tone: "success", duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined,
      });
    } else {
      toast(res.error || "Could not complete", { tone: "warn", duration: 3000 });
    }
  }

  async function escalate(t: AttnItem) {
    const res = await inlineUpdateTask(t.code, "escalation", "Yes");
    if (res.ok) {
      toast(`${t.code} escalated`, {
        tone: "success", duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined,
      });
      router.refresh();
    } else {
      toast(res.error || "Could not escalate", { tone: "warn", duration: 3000 });
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold tracking-tight">
          Attention today {items.length > 0 && <span className="text-fg-subtle font-normal">· {items.length}</span>}
        </h2>
        <Link href="/?tab=tasks&all=1" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors">
          All tasks <ArrowRight size={12} />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elev py-12 text-center elevated">
          <CheckCircle2 size={26} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-fg-muted">Nothing needs you right now.</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-bg-elev overflow-hidden elevated">
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
                  <SwipeRow onTap={() => open(t.code)} onSwipeRight={() => complete(t)} onSwipeLeft={() => escalate(t)}>
                    <div className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-bg-muted/50 transition-colors cursor-pointer border-b border-border/60">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor(t.flag))} />
                      <span className="font-mono text-[11px] text-fg-muted w-[64px] shrink-0">{t.code}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{t.actionItem}</span>
                        <span className="block truncate text-[11px] text-fg-muted">{t.companyName}</span>
                      </span>
                      <Pill tone={statusTone(t.status)} className="hidden sm:inline-flex shrink-0">{t.status}</Pill>
                      <span className={cn("text-[11px] font-medium shrink-0 w-[72px] text-right",
                        dl.tone === "danger" ? "text-red-600 dark:text-red-400" : dl.tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-fg-muted")}>
                        {dl.text}
                      </span>
                    </div>
                  </SwipeRow>
                </motion.div>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-fg-subtle">Tap to open · swipe right to complete · left to escalate</p>
        </>
      )}
    </section>
  );
}
