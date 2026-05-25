"use client";

import { useState, useTransition, useRef } from "react";
import { Sparkles, Loader2, ChevronDown, ChevronUp, X } from "lucide-react";
import { parseRawCapture } from "@/app/capture/actions";
import { createTask } from "@/app/task/actions";
import type { ParsedCapture } from "@/lib/smart-parse";

const STATUSES = ["Not Started","In Progress","Under Review","Blocked","Waiting External","Escalated","Completed","Closed"];
const PRIORITIES = ["Critical","High","Medium","Low"];
const CATEGORIES = ["Finance","Operations","Marketing","HR","Legal","Technology","Sales","Admin","Meetings","Strategy","Other"];

type Props = { companies: { id: number; name: string }[] };

export function QuickCapture({ companies }: Props) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedCapture | null>(null);
  const [isParsing, startParse] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Editable fields after parse
  const [companyId, setCompanyId] = useState("");
  const [actionItem, setActionItem] = useState("");
  const [priority, setPriority] = useState("Low");
  const [status, setStatus] = useState("Not Started");
  const [deadline, setDeadline] = useState("");
  const [assignees, setAssignees] = useState("");
  const [category, setCategory] = useState("");
  const [escalation, setEscalation] = useState("No");

  function handleParse() {
    if (!raw.trim()) return;
    setError(null);
    startParse(async () => {
      const result = await parseRawCapture(raw);
      setParsed(result);
      setCompanyId(result.companyId ? String(result.companyId) : "");
      setActionItem(result.actionItem);
      setPriority(result.priority);
      setStatus(result.status);
      setDeadline(result.deadline ? result.deadline.toISOString().slice(0, 10) : "");
      setAssignees(result.assigneeNames.join(", "));
      setCategory(result.category || "");
      setEscalation(result.escalation);
    });
  }

  function handleClear() {
    setRaw("");
    setParsed(null);
    setError(null);
  }

  function handleSave() {
    if (!companyId || !actionItem.trim()) {
      setError("Company and action item are required.");
      return;
    }
    setError(null);
    startSave(async () => {
      const fd = new FormData();
      fd.set("companyId", companyId);
      fd.set("actionItem", actionItem);
      fd.set("priority", priority);
      fd.set("status", status);
      fd.set("deadline", deadline);
      fd.set("accountable", assignees);
      fd.set("category", category);
      fd.set("escalation", escalation);
      await createTask(fd);
    });
  }

  const confidenceItems = parsed ? [
    parsed.companyName && { label: "Company", value: parsed.companyName },
    parsed.assigneeNames.length > 0 && { label: "Assigned to", value: parsed.assigneeNames.join(", ") },
    parsed.deadlineLabel && { label: "Deadline", value: parsed.deadlineLabel },
    parsed.priority !== "Low" && { label: "Priority", value: parsed.priority },
    parsed.status !== "Not Started" && { label: "Status", value: parsed.status },
    parsed.category && { label: "Category", value: parsed.category },
  ].filter(Boolean) as { label: string; value: string }[] : [];

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-accent" />
        <span className="font-semibold text-sm">Quick Capture</span>
        <span className="text-xs text-fg-muted ml-1">Type rough notes — the system figures out the rest</span>
      </div>

      {/* Input */}
      <div className="relative">
        <textarea
          rows={2}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleParse(); }}
          placeholder={'e.g. "dar spices packaging delay shivam urgent end of month"'}
          className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2.5 text-sm placeholder:text-fg-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 pr-24"
        />
        <div className="absolute right-2 bottom-2 flex gap-1.5">
          {raw && (
            <button onClick={handleClear} className="p-1.5 rounded text-fg-muted hover:text-fg transition-colors">
              <X size={14} />
            </button>
          )}
          <button
            onClick={handleParse}
            disabled={!raw.trim() || isParsing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {isParsing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {isParsing ? "Parsing…" : "Parse"}
          </button>
        </div>
      </div>

      <p className="text-xs text-fg-muted -mt-1">
        Tip: mention company name, person name, deadline (e.g. "end of month"), priority (urgent/high/critical), and status
      </p>

      {/* Parsed preview */}
      {parsed && (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Confidence badges */}
          {confidenceItems.length > 0 && (
            <div className="bg-accent/5 border-b border-border px-4 py-2.5 flex flex-wrap gap-2">
              <span className="text-xs text-fg-muted font-medium">Detected:</span>
              {confidenceItems.map(item => (
                <span key={item.label} className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent rounded-full px-2.5 py-0.5 font-medium">
                  <span className="text-fg-muted">{item.label}:</span> {item.value}
                </span>
              ))}
            </div>
          )}

          {/* Editable fields */}
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Company */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-fg-muted">Company *</label>
                <select
                  value={companyId}
                  onChange={e => setCompanyId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="">Select company…</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-fg-muted">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Action Item */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-muted">Action Item *</label>
              <input
                type="text"
                value={actionItem}
                onChange={e => setActionItem(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Status */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-fg-muted">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Deadline */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-fg-muted">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-fg-muted">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="">—</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Assignees */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-muted">Assigned to (comma-separated)</label>
              <input
                type="text"
                value={assignees}
                onChange={e => setAssignees(e.target.value)}
                placeholder="e.g. Shivam, Sarah"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isSaving && <Loader2 size={14} className="animate-spin" />}
                {isSaving ? "Creating…" : "Create Task"}
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 rounded-lg border border-border text-sm text-fg-muted hover:text-fg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
