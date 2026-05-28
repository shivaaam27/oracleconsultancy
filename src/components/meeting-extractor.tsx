"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { Loader2, Sparkles, Trash2, CheckCircle2, Plus, ChevronDown, ChevronUp, CheckSquare, Square } from "lucide-react";
import { parseMeetingNotes, bulkCreateTasks, type BulkTaskInput } from "@/app/meeting/actions";
import { polishActionItem } from "@/lib/smart-parse";
import type { MeetingTask } from "@/lib/meeting-parse";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PromptBox } from "@/components/prompt-box";
import { VoiceButton } from "@/components/voice-button";

const fieldCls =
  "w-full rounded-lg bg-bg-subtle border border-border/60 px-3 py-2 text-sm transition-colors focus:outline-none focus:border-accent focus:bg-bg";
const labelCls = "text-[11px] uppercase tracking-wide text-fg-subtle";

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
  const notesRef = useRef("");
  const updateNotes = useCallback((v: string) => { notesRef.current = v; setNotes(v); }, []);
  const appendNotes = useCallback((chunk: string) => {
    const next = notesRef.current ? `${notesRef.current} ${chunk}` : chunk;
    notesRef.current = next;
    setNotes(next);
  }, []);
  const [defaultCompany, setDefaultCompany] = useState<number>(0);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isParsing, startParse] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [saveFailures, setSaveFailures] = useState<{ actionItem: string; reason: string }[]>([]);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleExtract() {
    if (!notes.trim()) return;
    setError(null);
    setSavedCount(null);
    setSaveFailures([]);
    setParseInfo(null);
    startParse(async () => {
      const { tasks: parsed, source, aiError } = await parseMeetingNotes(notes, defaultCompany || undefined);
      setTasks(parsed.map((p, i) => taskFromParsed(p, i)));
      if (parsed.length === 0) {
        setError("No action items detected. Try adding bullet points or starting lines with action verbs.");
      }
      if (source === "rules-no-key") setParseInfo("AI extraction unavailable (no API key) — used rule-based parser.");
      else if (source === "rules-ai-error") setParseInfo(`AI extraction failed (${aiError || "unknown error"}) — used rule-based parser.`);
      else if (source === "rules-empty-ai") setParseInfo("AI returned no items — used rule-based parser as fallback.");
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
      const { created, failures } = await bulkCreateTasks(toSave);
      setSavedCount(created);
      setSaveFailures(failures.map(f => ({ actionItem: f.actionItem, reason: f.reason })));
      if (failures.length === 0) {
        setTasks([]);
        updateNotes("");
      } else {
        const failedKeys = new Set(failures.map(f => f.actionItem));
        setTasks(prev => prev.filter(t => failedKeys.has(t.actionItem)));
      }
      router.refresh();
    });
  }

  const checkedCount = tasks.filter(t => t.checked).length;
  const allChecked = tasks.length > 0 && tasks.every(t => t.checked);
  function toggleAll() {
    const next = !allChecked;
    setTasks(prev => prev.map(t => ({ ...t, checked: next })));
  }
  const summary = {
    companies: new Set(tasks.filter(t => t.companyId).map(t => t.companyId)).size,
    deadlines: tasks.filter(t => t.deadline).length,
    critical: tasks.filter(t => t.priority === "Critical").length,
  };

  return (
    <div className="space-y-5">
      {/* Input panel */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted px-1">
          Meeting Notes
          <span className="font-normal text-fg-subtle ml-1">— paste raw notes, bullet points, minutes, anything · ⌘↵ to extract</span>
        </label>
        <PromptBox
          value={notes}
          onChange={updateNotes}
          onSubmit={handleExtract}
          disabled={isParsing}
          submitOnEnter={false}
          minHeight={150}
          maxHeight={360}
          placeholder={`Dar Spices meeting — 26 May 2026\n\n- Review packaging supplier contract by end of month\n- Shivam to follow up on payment invoice urgent\n- Schedule quality inspection next week`}
          hint={
            <div className="flex items-center gap-1.5">
              <span className="text-fg-subtle shrink-0">Default company:</span>
              <select
                value={defaultCompany}
                onChange={e => setDefaultCompany(Number(e.target.value))}
                className="!bg-transparent !border-0 !shadow-none text-xs text-fg-muted focus:!ring-0 focus:!shadow-none cursor-pointer max-w-[160px] truncate"
              >
                <option value={0}>Auto-detect only</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          }
          actions={
            <>
              <VoiceButton disabled={isParsing} onResult={appendNotes} />
              <button
                onClick={handleExtract}
                disabled={!notes.trim() || isParsing}
                className="flex items-center gap-1.5 px-3.5 h-8 rounded-full bg-accent text-accent-fg text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isParsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {isParsing ? "Extracting…" : "Extract Action Items"}
              </button>
            </>
          }
        />
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

      {parseInfo && (
        <p className="text-xs text-warn bg-warn/5 border border-warn/20 rounded-lg px-4 py-2">{parseInfo}</p>
      )}

      {saveFailures.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
          <p className="font-medium text-danger mb-1.5">{saveFailures.length} task{saveFailures.length !== 1 ? "s" : ""} failed to save</p>
          <ul className="space-y-1 text-xs text-fg-muted">
            {saveFailures.map((f, i) => (
              <li key={i}><span className="text-fg">{f.actionItem || "(empty)"}</span> — {f.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Extracted tasks */}
      {tasks.length > 0 && (
        <div className="space-y-3 pb-16">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">
                Extracted Tasks — {checkedCount} of {tasks.length}
              </h2>
              <button
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
              >
                {allChecked ? <CheckSquare size={13} /> : <Square size={13} />}
                {allChecked ? "Deselect all" : "Select all"}
              </button>
            </div>
            <button onClick={addBlank} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-3 py-1.5 transition-colors">
              <Plus size={12} /> Add manually
            </button>
          </div>

          {/* Detected summary */}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted">{summary.companies} compan{summary.companies === 1 ? "y" : "ies"}</span>
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted">{summary.deadlines} deadline{summary.deadlines === 1 ? "" : "s"}</span>
            {summary.critical > 0 && (
              <span className="rounded-full bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-0.5">{summary.critical} critical</span>
            )}
          </div>

          <div className="space-y-2">
            {tasks.map(task => {
              const isExpanded = expandedId === task.id;
              const hasIssue = !task.companyId || !task.actionItem.trim();
              const stripe = task.priority === "Critical" ? "bg-danger"
                : task.priority === "High" ? "bg-warn"
                : task.priority === "Medium" ? "bg-accent"
                : "bg-border";
              return (
                <div
                  key={task.id}
                  className={`relative overflow-hidden card border transition-colors ${!task.checked ? "opacity-50" : ""} ${hasIssue ? "border-warn/40" : ""}`}
                >
                  <span className={`absolute left-0 top-0 bottom-0 w-1 ${stripe}`} />
                  {/* Row header */}
                  <div className="flex items-center gap-3 p-3 pl-4">
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
                        onBlur={async e => {
                        const rulebased = polishActionItem(e.target.value);
                        updateTask(task.id, { actionItem: rulebased });
                        try {
                          const res = await fetch("/api/polish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: e.target.value }) });
                          const { result } = await res.json();
                          if (result?.trim()) updateTask(task.id, { actionItem: result });
                        } catch {}
                      }}
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
                  <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      key="expand"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                    <div className="border-t border-border px-4 pb-4 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="space-y-1 col-span-2 sm:col-span-3">
                        <label className={labelCls}>Company *</label>
                        <select
                          value={task.companyId}
                          onChange={e => updateTask(task.id, { companyId: Number(e.target.value) })}
                          className={fieldCls}
                        >
                          <option value={0}>Select company…</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Priority</label>
                        <select value={task.priority} onChange={e => updateTask(task.id, { priority: e.target.value })} className={fieldCls}>
                          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Status</label>
                        <select value={task.status} onChange={e => updateTask(task.id, { status: e.target.value })} className={fieldCls}>
                          {STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Deadline</label>
                        <input type="date" value={task.deadline || ""}
                          onChange={e => updateTask(task.id, { deadline: e.target.value || null, deadlineLabel: null })}
                          className={fieldCls} />
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Category</label>
                        <select value={task.category || ""} onChange={e => updateTask(task.id, { category: e.target.value || null })} className={fieldCls}>
                          <option value="">—</option>
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Assigned to</label>
                        <input type="text" value={task.assigneeNames.join(", ")}
                          onChange={e => updateTask(task.id, { assigneeNames: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                          placeholder="comma-separated names"
                          className={fieldCls} />
                      </div>
                      <div className="space-y-1">
                        <label className={labelCls}>Escalation</label>
                        <select value={task.escalation} onChange={e => updateTask(task.id, { escalation: e.target.value })} className={fieldCls}>
                          <option>No</option><option>Yes</option>
                        </select>
                      </div>
                    </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Sticky create bar — clears the bottom nav pill */}
          <div className="sticky bottom-20 z-30 flex justify-end pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-3 vibrancy-strong rounded-full shadow-pill border border-border pl-4 pr-2 py-1.5">
              <span className="text-xs text-fg-muted">{checkedCount} task{checkedCount !== 1 ? "s" : ""} to create</span>
              <button
                onClick={handleSave}
                disabled={!checkedCount || isSaving}
                className="flex items-center gap-2 px-4 h-9 rounded-full bg-accent text-accent-fg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {isSaving ? "Creating…" : `Create ${checkedCount} Task${checkedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
