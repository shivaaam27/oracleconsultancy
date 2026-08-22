"use client";

import { useState } from "react";
import {
  MessageSquare, Plus, GitCommitHorizontal, CheckCircle2, AlertOctagon,
  Pencil, CalendarClock, Layers, Pin, ChevronDown, Trash2, MoreHorizontal, Loader2,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { CodeLinkedText } from "./code-linked-text";
import { useToast } from "./toast";
import { deleteTaskUpdate } from "@/app/task/actions";
import { deleteAuditEntry, recordCorrection } from "@/app/audit/actions";
import {
  formatAuditValue, summariseEditGroup,
  type TimelineItem, type TimelineUpdate,
} from "@/lib/timeline";

/* --------------------------------------------------------------------- */
/* Visual language — one place that maps an event to an icon + tone.       */
/* Shared by the per-task drawer, the per-company tab and the global feed. */
/* --------------------------------------------------------------------- */

type Tone = "accent" | "info" | "success" | "danger" | "warn" | "muted";

const TONE: Record<Tone, { node: string; icon: string }> = {
  accent: { node: "bg-accent-soft ring-accent/30", icon: "text-accent" },
  info: { node: "bg-info-soft/70 ring-info/30", icon: "text-info" },
  success: { node: "bg-success-soft/70 ring-success/30", icon: "text-success" },
  danger: { node: "bg-danger-soft/70 ring-danger/30", icon: "text-danger" },
  warn: { node: "bg-warn-soft/70 ring-warn/30", icon: "text-warn" },
  muted: { node: "bg-bg-subtle ring-border/60", icon: "text-fg-subtle" },
};

function visual(item: TimelineItem): { Icon: typeof Plus; tone: Tone } {
  if (item.kind === "update") return { Icon: MessageSquare, tone: "accent" };
  if (item.kind === "editgroup") return { Icon: Pencil, tone: "muted" };
  if (item.kind === "bulk") return { Icon: Layers, tone: "muted" };
  // audit
  if (item.entryType === "CORRECTION" || item.field === "Correction") return { Icon: Eraser, tone: "warn" };
  if (item.entryType === "CREATE") return { Icon: Plus, tone: "info" };
  if (item.field === "Task deleted" || item.entryType === "DELETE") return { Icon: Trash2, tone: "danger" };
  if (item.entryType === "ESCALATION" || item.newValue === "Escalated" || item.field === "Escalation") return { Icon: AlertOctagon, tone: "danger" };
  if (item.field === "Status") {
    if (item.newValue === "Completed" || item.newValue === "Closed") return { Icon: CheckCircle2, tone: "success" };
    if (item.newValue === "Blocked") return { Icon: AlertOctagon, tone: "danger" };
    return { Icon: GitCommitHorizontal, tone: "info" };
  }
  if (item.field === "Deadline" || item.field === "Due Date" || item.field === "Meeting Date") return { Icon: CalendarClock, tone: "warn" };
  return { Icon: Pencil, tone: "muted" };
}

/* --------------------------------------------------------------------- */
/* Time + actor helpers                                                    */
/* --------------------------------------------------------------------- */

export function relTime(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  const w = Math.round(days / 7);
  if (w < 5) return `${w}w ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function exactTime(d: Date): string {
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Friendly label for the system's createdBy discriminators. */
function actorLabel(by: string | null | undefined): string | null {
  if (!by) return null;
  if (by === "web-ui") return "You";
  if (by === "ai-command") return "AI";
  if (by === "meeting-mode") return "Meeting";
  if (by === "capture") return "Capture";
  // Portal posts are stamped "portal:<Name>" (staff), "portal-mgr:<Name>"
  // (managers) or "portal-dir:<Name>" (directors) — show just the name.
  if (by.startsWith("portal-dir:")) return by.slice(11);
  if (by.startsWith("portal-mgr:")) return by.slice(11);
  if (by.startsWith("portal:")) return by.slice(7);
  return by;
}

export type TimelineTask = { code: string; companyName?: string; companyAccent?: string | null; actionItem?: string };

/* --------------------------------------------------------------------- */
/* The unified entry                                                       */
/* --------------------------------------------------------------------- */

/** Update / audit ids this entry would soft-delete. CREATE is not deletable. */
function entryIds(item: TimelineItem): { kind: "update" | "audit"; id: number }[] {
  if (item.kind === "update") return [{ kind: "update", id: item.id }];
  if (item.kind === "editgroup") return item.items.map((a) => ({ kind: "audit" as const, id: a.id }));
  if (item.kind === "audit" && item.entryType !== "CREATE") return [{ kind: "audit", id: item.id }];
  return [];
}

export function TimelineEntry({
  item,
  task,
  onOpenTask,
  onChanged,
  deletable = true,
  isLast = false,
}: {
  item: TimelineItem;
  /** When provided, shows a clickable task chip (global / per-company scope). */
  task?: TimelineTask;
  onOpenTask?: (code: string) => void;
  /** Called after a soft-delete / undo so the host can refresh. */
  onChanged?: () => void;
  deletable?: boolean;
  isLast?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");

  if (item.kind === "bulk") return null;
  const { Icon, tone } = visual(item);
  const t = TONE[tone];
  const actor = actorLabel(item.createdBy);

  const ids = entryIds(item);
  const canDelete = deletable && ids.length > 0;

  async function doDelete() {
    setMenuOpen(false);
    setBusy(true);
    await Promise.all(ids.map((x) => (x.kind === "update" ? deleteTaskUpdate(x.id) : deleteAuditEntry(x.id))));
    setBusy(false);
    onChanged?.();
    toast("Removed from the timeline", { tone: "success", duration: 3000 });
  }

  // Corrections only make sense on a single plain audit entry (not updates,
  // groups, CREATEs, or entries that are themselves corrections).
  const canCorrect =
    item.kind === "audit" &&
    item.entryType !== "CREATE" &&
    item.entryType !== "CORRECTION" &&
    item.field !== "Correction" &&
    !item.correctedAt;

  async function doCorrect() {
    if (item.kind !== "audit") return;
    setBusy(true);
    const res = await recordCorrection(item.id, correctionNote);
    setBusy(false);
    if (res.ok) {
      setCorrecting(false);
      setCorrectionNote("");
      onChanged?.();
      toast("Correction recorded", { tone: "success", duration: 3000 });
    } else {
      toast(res.error ?? "Couldn't record the correction.", { tone: "danger" });
    }
  }

  const menu = canDelete ? (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        disabled={busy}
        aria-label="Entry options"
        className="h-6 w-6 -mr-1 inline-flex items-center justify-center rounded-full text-fg-subtle hover:text-fg hover:bg-bg-muted/60 transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <MoreHorizontal size={13} />}
      </button>
      {menuOpen && (
        <>
          <button type="button" aria-hidden tabIndex={-1} onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[60] cursor-default" />
          <div className="absolute right-0 top-full mt-1 z-[61] glass glass-menu rounded-lg p-1 min-w-[150px] shadow-lg">
            {canCorrect && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setCorrecting(true); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-fg hover:bg-bg-muted/60 transition-colors"
              >
                <Eraser size={12} /> Record correction
              </button>
            )}
            <button type="button" onClick={doDelete} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-danger hover:bg-danger-soft/50 transition-colors">
              <Trash2 size={12} /> Delete entry
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  const taskChip = task ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenTask?.(task.code); }}
      className="group/chip inline-flex items-center gap-1.5 min-w-0 max-w-full text-left"
    >
      <span className="font-mono text-xs font-medium text-fg-muted px-1.5 py-0.5 rounded-md bg-bg-subtle/70 ring-1 ring-border/50 shrink-0 group-hover/chip:text-accent group-hover/chip:ring-accent/30 transition-colors">{task.code}</span>
      {task.actionItem && <span className="truncate text-xs text-fg-muted group-hover/chip:text-fg transition-colors">{task.actionItem}</span>}
    </button>
  ) : null;

  const meta = (
    <div className="flex items-center gap-1.5 text-xs text-fg-subtle shrink-0">
      {actor && <span className="px-1.5 py-0.5 rounded-full bg-bg-subtle/60 text-fg-muted font-medium">{actor}</span>}
      <span title={exactTime(item.createdAt)}>{relTime(item.createdAt)}</span>
      {menu}
    </div>
  );

  return (
    <li className="flex gap-3">
      {/* Node + connector */}
      <div className="flex flex-col items-center shrink-0">
        <span className={cn("h-6 w-6 rounded-full ring-1 flex items-center justify-center", t.node)}>
          <Icon size={12} className={t.icon} />
        </span>
        {!isLast && <span className="w-px flex-1 bg-border/60 my-1" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-3">
        <Body item={item} taskChip={taskChip} meta={meta} />
        {correcting && (
          <div className="mt-2 space-y-1.5">
            <textarea
              autoFocus
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") doCorrect();
                if (e.key === "Escape") { setCorrecting(false); setCorrectionNote(""); }
              }}
              rows={2}
              placeholder="What is actually correct? The original entry stays for the record."
              className="w-full rounded-md border border-border bg-bg-elev px-2.5 py-2 text-xs leading-relaxed focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
            <div className="flex items-center justify-end gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => { setCorrecting(false); setCorrectionNote(""); }}
                disabled={busy}
                className="px-2 py-1 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
              >
                Cancel
              </button>
              <Button
                type="button"
                size="xs"
                onClick={doCorrect}
                disabled={busy || correctionNote.trim().length === 0}
              >
                Save correction
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function Body({ item, taskChip, meta }: { item: TimelineItem; taskChip: React.ReactNode; meta: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  if (item.kind === "bulk") return null;

  if (item.kind === "update") {
    const u = item as TimelineUpdate;
    return (
      <div className="rounded-xl bg-accent/5 ring-1 ring-accent/20 px-3 py-2.5 space-y-1.5">
        {/* Which task, and when. Side by side there is room for both on a desk;
            on a phone the actor pill, the time and the ⋯ take 128px of a 287px
            card and the task title is left with about 96, so it came out as
            "SA 189 · Pulin — …". Below `sm` the two stack: the title gets the
            whole first line, the when goes underneath. */}
        <div className="flex items-center justify-between gap-2 max-sm:flex-col max-sm:items-stretch max-sm:gap-1">
          {taskChip ?? <span className="text-xs font-medium text-accent inline-flex items-center gap-1">{u.pinnedAt && <Pin size={9} className="fill-accent" />}Update</span>}
          {meta}
        </div>
        <p className="text-xs leading-relaxed text-fg"><CodeLinkedText text={u.body} /></p>
        {u.statusChange && (
          <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
            <GitCommitHorizontal size={9} />
            {u.statusChange.from && <span>{u.statusChange.from}</span>}<span>→</span>
            <span className="font-medium text-fg">{u.statusChange.to}</span>
          </span>
        )}
        {u.editedAt && <span className="inline-flex items-center gap-0.5 text-xs text-fg-subtle ml-2"><Pencil size={8} /> edited</span>}
      </div>
    );
  }

  if (item.kind === "editgroup") {
    const { label, distinctFields } = summariseEditGroup(item);
    const safeLabel = distinctFields.length === 0 ? "Updated" : label;
    return (
      <div className="rounded-xl bg-bg-subtle/60 ring-1 ring-border/50 px-3 py-2">
        <div className="flex items-center justify-between gap-2 max-sm:flex-col max-sm:items-stretch max-sm:gap-1">
          <div className="min-w-0">{taskChip}</div>
          {meta}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 flex items-center gap-1 text-xs text-fg hover:text-accent transition-colors">
          <span className="font-medium">{safeLabel}</span>
          <ChevronDown size={12} className={cn("text-fg-subtle transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <ul className="mt-1.5 space-y-1">
            {item.items.map((a) => (
              <li key={a.id} className="flex items-center gap-1 flex-wrap text-xs">
                <span className="font-medium text-fg">{a.field || "Field"}</span>
                {a.oldValue && <span className="text-fg-muted">{formatAuditValue(a.field, a.oldValue)}</span>}
                {a.oldValue && a.newValue && <GitCommitHorizontal size={8} className="text-fg-subtle" />}
                {a.newValue && <span className="text-fg font-medium">{formatAuditValue(a.field, a.newValue)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // audit
  const isCreate = item.entryType === "CREATE";
  const isCorrection = item.entryType === "CORRECTION" || item.field === "Correction";
  return (
    <div className="rounded-xl bg-bg-subtle/50 ring-1 ring-border/50 px-3 py-2">
      <div className="flex items-center justify-between gap-2 max-sm:flex-col max-sm:items-stretch max-sm:gap-1">
        <div className="min-w-0">{taskChip}</div>
        {meta}
      </div>
      <div className="text-xs mt-0.5">
        {isCreate ? (
          <span className="text-fg-muted">Task created</span>
        ) : isCorrection ? (
          <span className="inline-flex items-start gap-1.5 flex-wrap">
            <span className="font-medium text-warn shrink-0">Correction{item.oldValue ? ` ${item.oldValue}` : ""}</span>
            {item.newValue && <span className="text-fg leading-relaxed">{item.newValue}</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 flex-wrap">
            <span className="font-medium text-fg">{item.field || item.entryType}</span>
            {item.oldValue && <span className="text-fg-muted">{formatAuditValue(item.field, item.oldValue)}</span>}
            {item.oldValue && item.newValue && <GitCommitHorizontal size={9} className="text-fg-subtle" />}
            {item.newValue && <span className="font-medium text-fg">{formatAuditValue(item.field, item.newValue)}</span>}
            {item.correctedAt && (
              <span
                title={`Corrected ${exactTime(item.correctedAt)} — see the Correction entry above`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warn-soft/70 text-warn text-xs font-medium"
              >
                <Eraser size={9} /> Corrected
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
