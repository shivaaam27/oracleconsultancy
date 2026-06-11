"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { Sparkles, Loader2, X, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseRawCapture } from "@/app/capture/actions";
import { createTask } from "@/app/task/actions";
import { polishDictation } from "@/app/voice/actions";
import type { ParsedCapture } from "@/lib/smart-parse";
import { polishActionItem } from "@/lib/smart-parse";
import { PromptBox } from "./prompt-box";
import { VoiceButton } from "./voice-button";

const STATUSES = ["Not Started","In Progress","Under Review","Blocked","Waiting External","Escalated","Completed","Closed"];
const PRIORITIES = ["Critical","High","Medium","Low"];
const CATEGORIES = ["Finance","Operations","Marketing","HR","Legal","Technology","Sales","Admin","Meetings","Strategy","Other"];

type Props = { companies: { id: number; name: string }[]; embedded?: boolean };

export function QuickCapture({ companies, embedded = false }: Props) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedCapture | null>(null);
  const [isParsing, startParse] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [polishState, setPolishState] = useState<"idle"|"loading"|"done">("idle");
  const [polishSource, setPolishSource] = useState<"ai"|"rules"|null>(null);
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null);
  const [lastRawVoice, setLastRawVoice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const rawRef = useRef("");

  // Keep a ref in sync so dictation callbacks always see the latest text.
  const updateRaw = useCallback((v: string) => {
    rawRef.current = v;
    setRaw(v);
  }, []);

  const appendDictation = useCallback((chunk: string) => {
    const next = rawRef.current ? `${rawRef.current} ${chunk}` : chunk;
    rawRef.current = next;
    setRaw(next);
  }, []);

  // Live captions: show committed text + interim in the field without committing it.
  const showInterim = useCallback((chunk: string) => {
    setRaw(rawRef.current ? `${rawRef.current} ${chunk}` : chunk);
  }, []);

  async function polishAndParseDictation() {
    const dictated = rawRef.current.trim();
    if (!dictated) return;
    setLastRawVoice(dictated);
    setVoiceInfo("Cleaning dictated task...");
    const result = await polishDictation({
      text: dictated,
      mode: "task",
      context: "Quick Capture task entry. Preserve company, person, priority, status, and deadline clues.",
    });
    updateRaw(result.polished);
    const tidied = result.changes ? ` Tidied ${result.changes} thing${result.changes === 1 ? "" : "s"}.` : "";
    setVoiceInfo(result.source === "ai" ? `Dictation polished by AUMIO.${tidied}` : "Dictation cleaned.");
    handleParse(result.polished);
  }

  // Editable fields after parse
  const [companyId, setCompanyId] = useState("");
  const [actionItem, setActionItem] = useState("");
  const [priority, setPriority] = useState("Low");
  const [status, setStatus] = useState("Not Started");
  const [deadline, setDeadline] = useState("");
  const [assignees, setAssignees] = useState("");
  const [category, setCategory] = useState("");
  const [escalation, setEscalation] = useState("No");

  function handleParse(text?: string) {
    const source = (text ?? raw).trim();
    if (!source) return;
    setError(null);
    startParse(async () => {
      try {
        const result = await parseRawCapture(source);
        setParsed(result);
        setCompanyId(result.companyId ? String(result.companyId) : "");
        setActionItem(result.actionItem || source);
        setPriority(result.priority);
        setStatus(result.status);
        setDeadline(result.deadline ? result.deadline.toISOString().slice(0, 10) : "");
        setAssignees(result.assigneeNames.join(", "));
        setCategory(result.category || "");
        setEscalation(result.escalation);
      } catch (err) {
        console.error("Parse error:", err);
        const fallback = {
          companyId: null, companyName: null,
          actionItem: source, priority: "Low", status: "Not Started",
          deadline: null, deadlineLabel: null, assigneeNames: [],
          category: null, escalation: "No", risk: null, rawInput: source,
        };
        setParsed(fallback);
        setActionItem(source);
        setPriority("Low");
        setStatus("Not Started");
        setDeadline("");
        setAssignees("");
        setCategory("");
        setEscalation("No");
        setError("Auto-detection failed — fill in the details below manually.");
      }
    });
  }

  function handleClear() {
    updateRaw("");
    setParsed(null);
    setError(null);
    setVoiceInfo(null);
    setLastRawVoice(null);
  }

  function handleSave() {
    if (!companyId || !actionItem.trim()) {
      setError("Company and action item are required.");
      return;
    }
    setError(null);
    startSave(async () => {
      try {
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
        setSaved(true);
        updateRaw("");
        setParsed(null);
        router.refresh();
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        console.error("Save error:", err);
        setError("Failed to create task. Please try again.");
      }
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
    <div className={embedded ? "p-4 space-y-4" : "card p-5 space-y-4"}>
      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-success text-sm font-medium">
          <CheckCircle2 size={14} /> Task created successfully!
        </div>
      )}
      {!embedded && (
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span className="font-semibold text-sm">Quick Capture</span>
          <span className="text-xs text-fg-muted ml-1">Type rough notes — the system figures out the rest</span>
        </div>
      )}

      {/* Input */}
      <PromptBox
        value={raw}
        onChange={updateRaw}
        onSubmit={() => handleParse()}
        disabled={isParsing}
        minHeight={72}
        placeholder={'Type or speak — e.g. "dar spices packaging delay shivam urgent end of month"'}
        actions={
          <>
            <VoiceButton
              disabled={isParsing}
              onResult={appendDictation}
              onInterim={showInterim}
              onStop={() => {
                void polishAndParseDictation();
              }}
              title="Dictate task"
            />
            {raw && (
              <button
                type="button"
                onClick={handleClear}
                title="Clear"
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"
              >
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleParse()}
              disabled={!raw.trim() || isParsing}
              className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-accent text-accent-fg text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {isParsing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {isParsing ? "Parsing…" : "Parse"}
            </button>
          </>
        }
      />

      <p className="text-xs text-fg-muted -mt-1">
        Tip: tap 🎙 to dictate, or type. Mention company name, person name, deadline (e.g. "end of month"), priority (urgent/high/critical), and status — the AI structures it for you.
      </p>

      {(voiceInfo || lastRawVoice) && (
        <div className="flex flex-wrap items-center gap-2 -mt-2 text-xs text-fg-muted">
          {voiceInfo && <span>{voiceInfo}</span>}
          {lastRawVoice && (
            <button type="button" onClick={() => { updateRaw(lastRawVoice); handleParse(lastRawVoice); }} className="text-accent hover:underline">
              Use raw
            </button>
          )}
        </div>
      )}

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
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
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
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Action Item */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-fg-muted">Action Item *</label>
              <div className="relative">
                <input
                  type="text"
                  value={actionItem}
                  onChange={e => { setActionItem(e.target.value); setPolishState("idle"); }}
                  className={`w-full rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none transition-colors ${
                    polishState === "done" ? "ring-2 ring-accent/50 !bg-accent/5" : ""
                  }`}
                />
                <button
                  type="button"
                  disabled={polishState === "loading"}
                  onClick={async () => {
                    const original = actionItem;
                    const rulebased = polishActionItem(original);
                    setActionItem(rulebased);
                    setPolishState("loading");
                    setPolishSource(null);
                    try {
                      const res = await fetch("/api/polish", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: original }),
                      });
                      const data = await res.json();
                      if (data.result?.trim()) setActionItem(data.result);
                      setPolishSource(data.source === "ai" ? "ai" : "rules");
                      setPolishState("done");
                      setTimeout(() => { setPolishState("idle"); setPolishSource(null); }, 3000);
                    } catch {
                      setPolishState("done");
                      setPolishSource("rules");
                      setTimeout(() => { setPolishState("idle"); setPolishSource(null); }, 3000);
                    }
                  }}
                  title="Polish with AI ✦"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-fg-muted hover:text-accent transition-colors disabled:opacity-50"
                >
                  {polishState === "loading"
                    ? <Loader2 size={14} className="animate-spin text-accent" />
                    : <Sparkles size={14} className={polishState === "done" ? "text-accent" : ""} />
                  }
                </button>
              </div>
              {polishState === "done" && (
                <p className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 size={11} />
                  {polishSource === "ai" ? "Polished with AI" : "Polished"}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Status */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-fg-muted">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
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
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-fg-muted">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
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
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
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
