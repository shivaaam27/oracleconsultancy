"use client";

/**
 * A task's History tab — the record of CHANGES, one quiet line each (owner,
 * 26 Sept 2026: "so many things happen in that task … it clutters"). Updates
 * are not repeated here: they are the Conversation. Each line says what
 * changed, who did it and when; a run of field edits folds into one line that
 * opens to show each.
 */
import { useState } from "react";
import { CalendarDays, ChevronDown, CircleDot, Flag, Layers, PencilLine, Plus } from "lucide-react";
import { formatAuditValue, type TimelineItem, type TimelineAudit } from "@/lib/tasks/timeline";
import { cn } from "@/lib/cn";

/** Who made a change, as the person reading should see it. */
export function historyAuthor(by: string | null, ownerView: boolean): string {
  if (!by) return "System";
  if (by === "web-ui" || by === "mcp:Owner") return ownerView ? "You" : "Administrator";
  if (by === "ai-command" || by.startsWith("ori")) return "ORI";
  const m = /^(?:portal(?:-[a-z]+)?|mcp):(.+)$/.exec(by);
  return m ? m[1] : by;
}

function ago(d: Date): string {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const NICE: Record<string, string> = { Status: "Stage", "Action Item": "Title", "Owner": "Accountable" };

/** The portal writes "status", the owner's side "Status" — one spelling. */
const FIELD_CANON: Record<string, string> = { status: "Status", deadline: "Deadline", priority: "Priority", risk: "Risk", escalation: "Escalation" };
export const canonField = (f: string | null) => (f ? FIELD_CANON[f] ?? f : f);

/** One change in words: "Stage In Progress → Completed". */
export function auditText(a: TimelineAudit): string {
  if (a.entryType === "CREATE") return "Task created";
  const field = a.field ? (NICE[a.field] ?? a.field) : "Changed";
  const from = formatAuditValue(a.field, a.oldValue);
  const to = formatAuditValue(a.field, a.newValue);
  if (!to && from) return `${field} cleared`;
  return from ? `${field} ${from} → ${to ?? "—"}` : `${field} → ${to ?? "—"}`;
}

export function iconFor(a: TimelineAudit | null) {
  if (!a) return Layers;
  if (a.entryType === "CREATE") return Plus;
  if (a.field === "Status") return CircleDot;
  if (a.field === "Deadline" || a.field === "Meeting Date") return CalendarDays;
  if (a.field === "Escalation" || a.entryType === "ESCALATION") return Flag;
  return PencilLine;
}

export function HistoryList({ items, ownerView }: { items: TimelineItem[]; ownerView: boolean }) {
  const rows = items.filter((i) => i.kind !== "update");
  if (!rows.length) return <div className="py-8 text-center text-sm text-[var(--st-muted,#888)]">No changes yet.</div>;
  return (
    <ol className="divide-y divide-[var(--st-line-soft,#eee)]">
      {rows.map((i) => <Row key={`${i.kind}-${i.id}`} item={i} ownerView={ownerView} />)}
    </ol>
  );
}

function Row({ item, ownerView }: { item: TimelineItem; ownerView: boolean }) {
  const [open, setOpen] = useState(false);
  if (item.kind === "update") return null;
  const who = historyAuthor(item.createdBy, ownerView);
  const many = item.kind === "editgroup" || item.kind === "bulk" ? item.items : null;
  const first = item.kind === "audit" ? item : many?.[0] ?? null;
  const Icon = iconFor(many && many.length > 1 ? null : first);
  const text = item.kind === "audit"
    ? auditText(item)
    : item.kind === "bulk"
      ? `${item.changeReason}`
      : many!.length === 1 ? auditText(many![0]) : `Edited ${many!.length} fields`;
  return (
    <li className="py-2">
      <button type="button" disabled={!many || many.length < 2} onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2.5 text-left text-[13px] disabled:cursor-default">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--st-page,#f3f3f1)] text-[var(--st-sub,#555)]"><Icon size={12} /></span>
        <span className="min-w-0 flex-1 truncate">{text}</span>
        <span className="shrink-0 text-[11px] text-[var(--st-muted,#888)]">{who} · {ago(item.createdAt)}</span>
        {many && many.length > 1 && <ChevronDown size={12} className={cn("shrink-0 text-[var(--st-muted,#888)] transition-transform", open && "rotate-180")} />}
      </button>
      {open && many && (
        <ul className="ml-[34px] mt-1.5 space-y-1 text-[12px] text-[var(--st-sub,#555)]">
          {many.map((a) => <li key={a.id} className="truncate">{auditText(a)}</li>)}
        </ul>
      )}
    </li>
  );
}
