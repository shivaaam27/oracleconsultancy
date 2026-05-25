"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, Trash2, CheckCircle2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { parseMeetingNotes, bulkCreateTasks, type BulkTaskInput } from "@/app/meeting/actions";
import { polishActionItem } from "@/lib/smart-parse";
import type { MeetingTask } from "@/lib/meeting-parse";
import { useRouter } from "next/navigation";

const STATUSES   = ["Not Started","In Progress","Under Review","Blocked","Waiting External","Escalated","Completed","Closed"];
const PRIORITIES = ["Critical","High","Medium","Low"];
const CATEGORIES = ["Finance","Operations","Marketing","HR","Legal","Technology","Sales","Admin","Meetings","Strategy","Other"];

type EditableTask = BulkTaskInput & { id: string; checked: boolean; deadlineLabel?: string | null };

function taskFromParsed(p: MeetingTask, idx: number): EditableTask {
  return {
    id: `t-${idx}`,
    checked: true,
    companyId: p.companyId ?? 0,
    actionItem: p.actionItem,
    priority: p.priority,
    status: p.status,
    deadline: p.deadline ? p.deadline.toISOString().slice(0, 10) : null,
    deadlineLabel: p.deadlineLabel,
    assigneeNames: p.assigneeNames,
    category: p.category,
    escalation: p.escalation,
  };
}

type Props = { companies: { id: number; name: string }[] };

export function MeetingExtractor({ companies }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [defaultCompany, setDefaultCompany] = useState<number>(0);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isParsing, startParse] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleExtract() {
    if (!notes.trim()) return;
    setError(null);
    setSavedCount(null);
    startParse(async () => {
      const parsed = await parseMeetingNotes(notes, defaultCompany || undefined);
      setTasks(parsed.map((p, i) => taskFromParsed(p, i)));
      if (parsed.length === 0) setError("No action items detected. Try adding bullet points or starting lines with action verbs.");
    });
  }

  function updateTask(id: string, patch: Partial<EditableTask>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function addBlank() {
    const id = `t-manual-${Date.now()}`;
    setTasks(prev => [...prev, {
      id, checked: true, companyId: defaultCompany || companies[0]?.id || 0,
      actionItem: "", priority: "Low", status: "Not Started",
      deadline: null, deadlineLabel: null, assigneeNames: [], category: null, escalation: "No",
    }]);
    setExpandedId(id);
  }

  function handleSave() {
    const toSave = tasks.filter(t => t.checked && t.actionItem.trim() && t.companyId);
    if (!toSave.length) { setError("Select at least one task with a company and action item."); return; }
    setError(null);
    startSave(async () => {
      const { created } = await bulkCreateTasks(toSave);
      setSavedCount(created);
      setTasks([]);
      setNotes("");
      router.refresh();
    });
  }

  const checkedCount = tasks.filter(t => t.checked).length;

  return (
    <div className="space-y-6">
      {/* Input panel */}
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-fg-muted">Default Company <span className="font-normal">(applied when not detected in the text)</span></label>
            <select
              value={defaultCompany}
              onChange={e => setDefaultCompany(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value={0}>— Auto-detect only —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-fg-muted">
            Meeting Notes
            <span className="font-normal text-fg-subtle ml-1">— paste raw notes, bullet points, minutes, anything</span>
          </label>
          <textarea
            rows={8}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={`Dar Spices meeting — 26 May 2026\n\n- Review packaging supplier contract by end of month\n- Shivam to follow up on payment invoice urgent\n- Schedule quality inspection next week\n- John will send updated sales report by Friday\n- Resolve warehouse delay — critical`}
            className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-3 text-sm placeholder:text-fg-subtle resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono leading-relaxed"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExtract}
            disabled={!notes.trim() || isParsing}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {isParsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isParsing ? "Extracting…" : "Extract Action Items"}
          </button>
          {tasks.length > 0 && (
            <span className="text-xs text-fg-muted">{tasks.length} item{tasks.length !== 1 ? "s" : ""} found — edit before saving</span>
          )}
        </div>
      </div>

      {/* Success */}
      {savedCount !== null && (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-success text-sm font-medium">
          <CheckCircle2 size={16} />
          {savedCount} task{savedCount !== 1 ? "s" : ""} created successfully and added to the registry.
        </div>
      )}

      {error && (
        <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-4 py-3">{error}</p>
      )}

      {/* Extracted tasks */}
      {tasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">
              Extracted Tasks — {checkedCount} of {tasks.length} selected
            </h2>
            <div className="flex gap-2">
              <button onClick={addBlank} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-3 py-1.5 transition-colors">
                <Plus size={12} /> Add manually
              </button>
              <button
                onClick={handleSave}
                disabled={!checkedCount || isSaving}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                {isSaving ? "Creating…" : `Create ${checkedCount} Task${checkedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {tasks.map(task => {
              const isExpanded = expandedId === task.id;
              const hasIssue = !task.companyId || !task.actionItem.trim();
              return (
                <div
                  key={task.id}
                  className={`card border transition-colors ${!task.checked ? "opacity-50" : ""} ${hasIssue ? "border-warn/40" : ""}`}
                >
                  {/* Row header */}
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={task.checked}
                      onChange={e => updateTask(task.id, { checked: e.target.checked })}
                      className="accent-[var(--accent)] w-4 h-4 shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={task.actionItem}
                        onChange={e => updateTask(task.id, { actionItem: e.target.value })}
                        onBlur={e => updateTask(task.id, { actionItem: polishActionItem(e.target.value) })}
                        placeholder="Action item…"
                        className="w-full bg-transparent text-sm focus:outline-none placeholder:text-fg-muted"
                      />
                      <div className="flex flex-wrap gap-2 mt-1">
                        {task.companyId ? (
                          <span className="text-xs text-fg-muted">{companies.find(c => c.id === task.companyId)?.name}</span>
                        ) : (
                          <span className="text-xs text-warn">⚠ No company</span>
                        )}
                        {task.assigneeNames.length > 0 && (
                          <span className="text-xs text-fg-muted">→ {task.assigneeNames.join(", ")}</span>
                        )}
                        {task.deadline && (
                          <span className="text-xs text-fg-muted">📅 {task.deadlineLabel || task.deadline}</span>
                        )}
                        {task.priority !== "Low" && (
                          <span className={`text-xs font-medium ${task.priority === "Critical" || task.priority === "High" ? "text-warn" : "text-fg-muted"}`}>{task.priority}</span>
                        )}
                        {task.category && (
                          <span className="text-xs text-fg-muted">{task.category}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : task.id)}
                        className="p-1.5 rounded text-fg-muted hover:text-fg transition-colors"
                        title="Edit details"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button
                        onClick={() => removeTask(task.id)}
                        className="p-1.5 rounded text-fg-muted hover:text-danger transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded edit */}
                  {isExpanded && (
                    <div className="border-t border-border px-3 pb-3 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="space-y-1 col-span-2 sm:col-span-3">
                        <label className="text-xs text-fg-muted">Company *</label>
                        <select
                          value={task.companyId}
                          onChange={e => updateTask(task.id, { companyId: Number(e.target.value) })}
                          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                        >
                          <option value={0}>Select company…</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted">Priority</label>
                        <select value={task.priority} onChange={e => updateTask(task.id, { priority: e.target.value })}
                          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50">
                          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted">Status</label>
                        <select value={task.status} onChange={e => updateTask(task.id, { status: e.target.value })}
                          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50">
                          {STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted">Deadline</label>
                        <input type="date" value={task.deadline || ""}
                          onChange={e => updateTask(task.id, { deadline: e.target.value || null, deadlineLabel: null })}
                          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted">Category</label>
                        <select value={task.category || ""} onChange={e => updateTask(task.id, { category: e.target.value || null })}
                          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50">
                          <option value="">—</option>
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted">Assigned to</label>
                        <input type="text" value={task.assigneeNames.join(", ")}
                          onChange={e => updateTask(task.id, { assigneeNames: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                          placeholder="comma-separated names"
                          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-fg-muted">Escalation</label>
                        <select value={task.escalation} onChange={e => updateTask(task.id, { escalation: e.target.value })}
                          className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50">
                          <option>No</option><option>Yes</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom save bar */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-xs text-fg-muted">{checkedCount} task{checkedCount !== 1 ? "s" : ""} will be created</span>
            <button
              onClick={handleSave}
              disabled={!checkedCount || isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {isSaving ? "Creating tasks…" : `Create ${checkedCount} Task${checkedCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
