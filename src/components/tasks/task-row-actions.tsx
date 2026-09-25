"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, AlertTriangle, MoreHorizontal, Pin, Clock, Trash2, Loader2, MessageSquarePlus, Archive } from "lucide-react";
import type { TaskRow } from "@/lib/tasks/queries";
import { inlineUpdateTask, deleteTaskQuick, adminTogglePin, setTaskArchived } from "@/app/task/actions";
import { useToast } from "../shell/toast";
import { callUndo } from "../shell/undo-banner";
import { SnoozeSheet } from "./snooze-sheet";
import { IconButton } from "../ui";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * TaskRowActions — the inline ✓ / ! / … action cluster for a task row.
 *
 *   ✓  Complete   → status = Completed (optimistic + undo)
 *   !  Escalate   → escalation = Yes (→ Escalated status) (optimistic + undo)
 *   …  menu       → Pin latest update · Snooze deadline · Delete (undo)
 *
 * Reuses inlineUpdateTask + deleteTaskQuick + adminTogglePin (no new action),
 * the shared SnoozeSheet, and IconButton. Every mutation shows a toast with an
 * Undo where the wiring supports it. The cluster is meant to live in a row's
 * trailing slot — pass `compact` for the mobile/always-visible trailing `…`.
 * ------------------------------------------------------------------ */

export function TaskRowActions({
  task,
  compact = false,
  className,
  onDone,
  onUpdate,
}: {
  task: TaskRow;
  /** Mobile / dense rows: collapse ✓ + ! into the `…` menu, show only `…`. */
  compact?: boolean;
  className?: string;
  /** Called after any successful mutation (e.g. to refresh a local list). */
  onDone?: () => void;
  /** Supplying this adds an "Update" button that asks the LIST to open its
   *  inline composer for this row — the composer itself belongs to the list,
   *  because it renders on the row's second line. Omit it and no button shows. */
  onUpdate?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const done = task.status === "Completed" || task.status === "Closed";

  // Position the portalled `…` menu under its trigger, clamped to the viewport.
  useEffect(() => {
    if (!menuOpen) { setPos(null); return; }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 200;
      let left = r.right - w;
      if (left < 8) left = 8;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      setPos({ top: r.bottom + 6, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /** Run an inlineUpdateTask change with a success toast + Undo. */
  function applyInline(field: "status" | "escalation", value: string, msg: string) {
    setMenuOpen(false);
    start(async () => {
      const res = await inlineUpdateTask(task.code, field, value);
      if (!res.ok) { toast(res.error || "Couldn't update.", { tone: "danger" }); return; }
      toast(msg, {
        tone: "success",
        duration: 8000,
        action: res.undoToken ? {
          label: "Undo",
          onClick: async () => {
            const r = await callUndo(res.undoToken!);
            toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 });
            router.refresh();
          },
        } : undefined,
      });
      onDone?.();
      router.refresh();
    });
  }

  function snooze(iso: string) {
    setSnoozeOpen(false);
    start(async () => {
      const res = await inlineUpdateTask(task.code, "deadline", iso);
      if (!res.ok) { toast(res.error || "Couldn't snooze.", { tone: "danger" }); return; }
      toast(`${task.code} snoozed.`, {
        tone: "success",
        duration: 8000,
        action: res.undoToken ? {
          label: "Undo",
          onClick: async () => { await callUndo(res.undoToken!); router.refresh(); },
        } : undefined,
      });
      onDone?.();
      router.refresh();
    });
  }

  function togglePin() {
    setMenuOpen(false);
    if (!task.latestActivity) {
      toast("Add an update first, then pin it as the instruction.", { tone: "warn" });
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("updateId", String(task.latestActivity!.id));
      await adminTogglePin(fd);
      toast(task.pinned ? "Instruction unpinned." : "Latest update pinned.", { tone: "success" });
      onDone?.();
      router.refresh();
    });
  }

  // Delete asks twice: the first press turns the item into a confirm row, the
  // second deletes. One click from a ⋯ menu was the only unconfirmed delete in
  // the system (the record page and bulk edit both confirm).
  const [confirmDel, setConfirmDel] = useState(false);
  function del() {
    setMenuOpen(false);
    setConfirmDel(false);
    start(async () => {
      const res = await deleteTaskQuick(task.code);
      if (!res.ok) { toast(res.error || "Couldn't delete.", { tone: "danger" }); return; }
      toast(`${task.code} deleted.`, {
        tone: "success",
        duration: 10000,
        action: res.undoToken ? {
          label: "Undo",
          onClick: async () => {
            const r = await callUndo(res.undoToken!);
            toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 });
            router.refresh();
          },
        } : undefined,
      });
      onDone?.();
      router.refresh();
    });
  }

  function archive() {
    setMenuOpen(false);
    start(async () => {
      const res = await setTaskArchived(task.code, true);
      if (!res.ok) { toast(res.error || "Couldn't archive.", { tone: "danger" }); return; }
      toast(`${task.code} archived.`, {
        tone: "success", duration: 8000,
        action: { label: "Undo", onClick: async () => { await setTaskArchived(task.code, false); router.refresh(); } },
      });
      onDone?.();
      router.refresh();
    });
  }

  const menuItems = [
    { key: "pin", label: task.pinned ? "Unpin instruction" : "Pin latest update", icon: <Pin size={14} className={task.pinned ? "fill-current" : undefined} />, onClick: togglePin, tone: "default" as const },
    { key: "snooze", label: "Snooze…", icon: <Clock size={14} />, onClick: () => { setMenuOpen(false); setSnoozeOpen(true); }, tone: "default" as const },
    { key: "archive", label: "Archive", icon: <Archive size={14} />, onClick: archive, tone: "default" as const },
    { key: "delete", label: "Delete…", icon: <Trash2 size={14} />, onClick: () => setConfirmDel(true), tone: "danger" as const },
  ];

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Add an update without opening the record. First, because "say what is
          happening" is the commonest thing to want from a list. */}
      {onUpdate && (
        <IconButton
          size="sm"
          variant="ghost"
          title="Add an update"
          aria-label={`Add an update on ${task.code}`}
          onClick={onUpdate}
          className="hover:text-accent"
        >
          <MessageSquarePlus size={14} />
        </IconButton>
      )}

      {/* ✓ Complete + ! Escalate (hidden on compact rows — they live in the menu) */}
      {!compact && !done && (
        <>
          <IconButton
            size="sm"
            variant="ghost"
            title="Mark complete"
            aria-label="Mark complete"
            disabled={pending}
            onClick={() => applyInline("status", "Completed", `${task.code} completed.`)}
            className="hover:text-success"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            title="Escalate"
            aria-label="Escalate"
            disabled={pending}
            onClick={() => applyInline("escalation", "Yes", `${task.code} escalated.`)}
            className="hover:text-danger"
          >
            <AlertTriangle size={14} />
          </IconButton>
        </>
      )}

      {/* … menu */}
      <IconButton
        ref={btnRef}
        size="sm"
        variant="ghost"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={pending}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <MoreHorizontal size={15} />
      </IconButton>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              ref={menuRef}
              role="menu"
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -2 }}
              transition={spring}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
              className="fixed z-[120] w-[200px] glass glass-menu elevated rounded-xl shadow-lg p-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* On compact rows, surface ✓/! at the top of the menu instead. */}
              {compact && !done && (
                <>
                  <MenuButton icon={<Check size={14} />} onClick={() => applyInline("status", "Completed", `${task.code} completed.`)}>Complete</MenuButton>
                  <MenuButton icon={<AlertTriangle size={14} />} onClick={() => applyInline("escalation", "Yes", `${task.code} escalated.`)}>Escalate</MenuButton>
                  <div className="my-1 h-px bg-border/60" />
                </>
              )}
              {menuItems.filter((m) => !(confirmDel && m.key === "delete")).map((m) => (
                <MenuButton key={m.key} icon={m.icon} tone={m.tone} onClick={m.onClick}>{m.label}</MenuButton>
              ))}
              {confirmDel && (
                <div className="mt-1 flex items-center gap-1.5 rounded-md bg-danger-soft/50 px-2 py-1.5 text-xs ring-1 ring-danger/25">
                  <span className="min-w-0 flex-1">Delete {task.code}?</span>
                  <button type="button" onClick={() => setConfirmDel(false)} className="rounded px-1.5 py-0.5 text-fg-muted hover:text-fg">Keep</button>
                  <button type="button" onClick={del} className="rounded bg-danger px-2 py-0.5 font-medium text-white hover:opacity-90">Delete</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <SnoozeSheet
        open={snoozeOpen}
        onClose={() => setSnoozeOpen(false)}
        onPick={snooze}
        label={`Snooze ${task.code} until…`}
      />
    </div>
  );
}

function MenuButton({
  icon,
  children,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 text-left text-sm px-2.5 py-2 rounded-lg transition-colors",
        tone === "danger"
          ? "text-danger hover:bg-danger-soft/50"
          : "text-fg-muted hover:bg-bg-muted hover:text-fg",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}
