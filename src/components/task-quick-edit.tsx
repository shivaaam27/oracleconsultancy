"use client";

import { useState } from "react";
import { Clock, Check, Users } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { FluidSelect } from "./fluid-select";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";

const STATUSES = ["Not Started", "In Progress", "Under Review", "Waiting External", "Blocked", "Escalated", "Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isTimed = (d: Date) => d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;

/**
 * Compact, inline quick editor shown inside the long-press peek. Covers the
 * common fast updates — status, priority, deadline (+ optional time). Accountable
 * is shown read-only; changing people is "detailed work" → open the full task.
 * Edits apply in place and keep the peek open so several can be made in a row.
 */
export function TaskQuickEdit({ row, onChanged }: { row: TaskRow; onChanged?: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(row.status);
  const [priority, setPriority] = useState(row.priority);
  const d0 = row.deadline ?? null;
  const [date, setDate] = useState(d0 ? localDate(d0) : "");
  const [time, setTime] = useState(d0 && isTimed(d0) ? `${pad(d0.getHours())}:${pad(d0.getMinutes())}` : "");

  function notify(label: string, undoToken?: string | null) {
    toast(label, {
      tone: "success",
      duration: 6000,
      action: undoToken ? { label: "Undo", onClick: async () => { await callUndo(undoToken); onChanged?.(); } } : undefined,
    });
  }

  async function apply(field: "status" | "priority" | "deadline", value: string | null, label: string) {
    const res = await inlineUpdateTask(row.code, field, value);
    if (res.ok) notify(label, res.undoToken);
    else toast(res.error || "Save failed", { tone: "warn", duration: 3000 });
    onChanged?.();
  }

  function saveDeadline() {
    const value = date ? (time ? `${date}T${time}` : date) : null;
    apply("deadline", value, value ? `${row.code} deadline set` : `${row.code} deadline cleared`);
  }

  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-fg-muted">Status</span>
        <FluidSelect
          value={status}
          onSelect={(v) => { setStatus(v); apply("status", v, `${row.code} → ${v}`); }}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          className="flex-1"
          buttonClassName="w-full justify-between"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-fg-muted">Priority</span>
        <FluidSelect
          value={priority}
          onSelect={(v) => { setPriority(v); apply("priority", v, `${row.code} priority ${v}`); }}
          options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          className="flex-1"
          buttonClassName="w-full justify-between"
        />
      </div>

      <div className="flex items-start gap-2">
        <span className="w-20 shrink-0 text-xs text-fg-muted pt-1.5 inline-flex items-center gap-1"><Clock size={12} /> Deadline</span>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-lg border border-border bg-bg"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
              className="px-2 py-1.5 text-sm rounded-lg border border-border bg-bg disabled:opacity-40"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={saveDeadline} className="inline-flex items-center gap-1 rounded-lg bg-accent text-accent-fg px-2.5 py-1 text-xs font-medium hover:opacity-90">
              <Check size={12} /> Save
            </button>
            {time && <button type="button" onClick={() => setTime("")} className="text-xs text-fg-muted hover:text-fg px-1.5 py-1">All day</button>}
            {date && <button type="button" onClick={() => { setDate(""); setTime(""); apply("deadline", null, `${row.code} deadline cleared`); }} className="text-xs text-fg-muted hover:text-fg px-1.5 py-1">Clear</button>}
          </div>
        </div>
      </div>

      {row.assignees.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-fg-muted inline-flex items-center gap-1"><Users size={12} /> Owner</span>
          <span className="flex-1 text-xs text-fg-muted truncate">{row.assignees.join(", ")}</span>
        </div>
      )}
    </div>
  );
}
