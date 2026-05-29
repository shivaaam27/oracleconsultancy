"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, Loader2, ListTodo, NotebookPen, CheckCircle2, ArrowRight,
  ArrowLeft, Building2, CalendarDays, Flag, User, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { parseRawCapture, createCaptureTask } from "@/app/capture/actions";
import { createNote } from "@/app/notes/actions";
import { markInboxFiled } from "@/app/inbox/actions";
import type { ParsedCapture } from "@/lib/smart-parse";

type Company = { id: number; name: string };
type Kind = "task" | "note";
type Step = "intake" | "task" | "note" | "done";

const PRIORITIES = ["Low", "Medium", "High", "Critical"];

// WhatsApp share text often arrives like "[12:34, 5/6/2026] Name: message".
// Strip the bracketed timestamp/sender prefix so the real message is captured.
function cleanShared(text: string): string {
  return text
    .replace(/^\[\d{1,2}:\d{2}(?::\d{2})?[^\]]*\]\s*[^:]{1,40}:\s*/gm, "")
    .trim();
}

// Smart-parse strips detected company/person/priority words, which can leave
// stray commas ("Packaging delay, chase , ,"). Tidy those into clean prose.
function tidyAction(s: string): string {
  const out = s
    .replace(/[,\s]*,[,\s]*/g, ", ") // collapse comma groups to ", "
    .replace(/(?:,\s*)+$/g, "")       // drop trailing commas
    .replace(/^[,\s]+/, "")           // drop leading commas/space
    .replace(/\s{2,}/g, " ")
    .trim();
  return out ? out[0].toUpperCase() + out.slice(1) : s.trim();
}

function firstLineTitle(text: string): string {
  const line = text.split(/\n/)[0].trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || "Captured note";
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function quickDate(which: "today" | "week" | "nextweek"): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (which === "today") return ymd(d);
  if (which === "week") {
    const df = (5 - d.getDay() + 7) % 7 || 7; // upcoming Friday
    d.setDate(d.getDate() + df);
    return ymd(d);
  }
  d.setDate(d.getDate() + 7);
  return ymd(d);
}

export function CaptureWizard({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("capture") === "open";
  const inboxId = searchParams.get("inbox");

  const [step, setStep] = useState<Step>("intake");
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedCapture | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: Kind; label: string; href: string } | null>(null);

  // Task fields
  const [companyId, setCompanyId] = useState("");
  const [actionItem, setActionItem] = useState("");
  const [priority, setPriority] = useState("Low");
  const [deadline, setDeadline] = useState("");
  const [assignees, setAssignees] = useState("");
  // Note fields
  const [noteTitle, setNoteTitle] = useState("");
  const [noteCompanyId, setNoteCompanyId] = useState("");

  const initialised = useRef(false);

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("capture");
    params.delete("text");
    params.delete("inbox");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [router, pathname, searchParams]);

  // When opened, seed from the ?text= param (share/email deep-link) and parse.
  useEffect(() => {
    if (!open) {
      initialised.current = false;
      return;
    }
    if (initialised.current) return;
    initialised.current = true;

    const seed = cleanShared(searchParams.get("text") || "");
    setStep("intake");
    setError(null);
    setResult(null);
    setRaw(seed);
    setParsed(null);
    if (seed) void runParse(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function runParse(text: string) {
    setParsing(true);
    try {
      const p = await parseRawCapture(text);
      setParsed(p);
      setCompanyId(p.companyId ? String(p.companyId) : "");
      setNoteCompanyId(p.companyId ? String(p.companyId) : "");
      setActionItem(tidyAction(p.actionItem || text));
      setPriority(p.priority);
      setDeadline(p.deadline ? ymd(p.deadline) : "");
      setAssignees(p.assigneeNames.join(", "));
      setNoteTitle(firstLineTitle(text));
    } catch {
      setActionItem(text);
      setNoteTitle(firstLineTitle(text));
    } finally {
      setParsing(false);
    }
  }

  // Heuristic: does this look more like a task or a note?
  const suggestion: Kind = (() => {
    if (!parsed) return "task";
    if (parsed.deadline || parsed.priority !== "Low" || parsed.escalation === "Yes") return "task";
    if (raw.length > 280) return "note";
    return "task";
  })();

  function chooseKind(kind: Kind) {
    setError(null);
    setStep(kind);
  }

  async function saveTask() {
    if (!companyId || !actionItem.trim()) {
      setError("Pick a company and confirm the action.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createCaptureTask({
      companyId: parseInt(companyId, 10),
      actionItem,
      priority,
      deadline: deadline || null,
      assignees,
    });
    setSaving(false);
    if (res.ok && res.code) {
      if (inboxId) await markInboxFiled(parseInt(inboxId, 10), "task", res.code).catch(() => {});
      setResult({ kind: "task", label: res.code, href: `/task/${res.code}` });
      setStep("done");
      router.refresh();
    } else {
      setError(res.error || "Could not create the task.");
    }
  }

  async function saveNote() {
    if (!raw.trim()) {
      setError("There's nothing to save.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const m = await createNote({
        title: noteTitle.trim() || firstLineTitle(raw),
        companyId: noteCompanyId ? parseInt(noteCompanyId, 10) : null,
        body: raw,
      });
      if (inboxId) await markInboxFiled(parseInt(inboxId, 10), "note", String(m.id)).catch(() => {});
      setResult({ kind: "note", label: m.title, href: "/workbook?tab=notes" });
      setStep("done");
      router.refresh();
    } catch {
      setError("Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="cap-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            key="cap-panel"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="fixed z-[81] inset-x-0 bottom-0 origin-bottom
              sm:inset-0 sm:m-auto sm:h-fit sm:max-w-lg sm:origin-center"
          >
            <div className="flex max-h-[88svh] flex-col overflow-hidden glass
              rounded-t-2xl sm:rounded-2xl pb-[env(safe-area-inset-bottom)]">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-accent">
                    <Sparkles size={15} className="text-accent-fg" />
                  </span>
                  <span className="font-semibold text-sm">Capture</span>
                  {parsing && <Loader2 size={13} className="animate-spin text-fg-muted" />}
                </div>
                <button onClick={close} aria-label="Close" className="h-7 w-7 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto px-4 py-4">
                {step === "intake" && (
                  <IntakeStep
                    raw={raw}
                    onChange={setRaw}
                    onReparse={() => runParse(raw)}
                    suggestion={suggestion}
                    onChoose={chooseKind}
                    detected={parsed}
                  />
                )}

                {step === "task" && (
                  <TaskStep
                    companies={companies}
                    companyId={companyId} setCompanyId={setCompanyId}
                    actionItem={actionItem} setActionItem={setActionItem}
                    priority={priority} setPriority={setPriority}
                    deadline={deadline} setDeadline={setDeadline}
                    assignees={assignees} setAssignees={setAssignees}
                    onBack={() => setStep("intake")}
                    onSave={saveTask}
                    saving={saving}
                    error={error}
                  />
                )}

                {step === "note" && (
                  <NoteStep
                    companies={companies}
                    title={noteTitle} setTitle={setNoteTitle}
                    companyId={noteCompanyId} setCompanyId={setNoteCompanyId}
                    body={raw} setBody={setRaw}
                    onBack={() => setStep("intake")}
                    onSave={saveNote}
                    saving={saving}
                    error={error}
                  />
                )}

                {step === "done" && result && (
                  <DoneStep result={result} onClose={close} onAnother={() => {
                    setRaw(""); setParsed(null); setResult(null); setError(null); setStep("intake");
                  }} onOpen={() => { close(); router.push(result.href); }} />
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Intake ───────────────────────────────────────────────────────────── */

function IntakeStep({
  raw, onChange, onReparse, suggestion, onChoose, detected,
}: {
  raw: string;
  onChange: (v: string) => void;
  onReparse: () => void;
  suggestion: Kind;
  onChoose: (k: Kind) => void;
  detected: ParsedCapture | null;
}) {
  const chips = detected ? [
    detected.companyName && { icon: Building2, text: detected.companyName },
    detected.deadlineLabel && { icon: CalendarDays, text: detected.deadlineLabel },
    detected.priority !== "Low" && { icon: Flag, text: detected.priority },
    detected.assigneeNames[0] && { icon: User, text: detected.assigneeNames.join(", ") },
  ].filter(Boolean) as { icon: typeof Building2; text: string }[] : [];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">What came in?</label>
        <textarea
          value={raw}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onReparse}
          rows={4}
          placeholder="Paste or type — a message, an email, a thought…"
          className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent rounded-full px-2.5 py-1">
              <c.icon size={11} /> {c.text}
            </span>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-fg-muted mb-2">What would you like to do with it?</p>
        <div className="grid grid-cols-2 gap-2.5">
          <KindCard
            icon={ListTodo}
            title="Make a task"
            sub="Track it as an action"
            suggested={suggestion === "task"}
            disabled={!raw.trim()}
            onClick={() => onChoose("task")}
          />
          <KindCard
            icon={NotebookPen}
            title="Save as note"
            sub="Keep it as memory"
            suggested={suggestion === "note"}
            disabled={!raw.trim()}
            onClick={() => onChoose("note")}
          />
        </div>
      </div>
    </div>
  );
}

function KindCard({
  icon: Icon, title, sub, suggested, disabled, onClick,
}: {
  icon: typeof ListTodo; title: string; sub: string; suggested: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all disabled:opacity-40",
        suggested ? "border-accent bg-accent/5 hover:bg-accent/10" : "border-border bg-bg-elev hover:border-accent/50"
      )}
    >
      {suggested && (
        <span className="absolute right-2 top-2 text-[9px] uppercase tracking-wider text-accent font-semibold">Suggested</span>
      )}
      <Icon size={20} className={suggested ? "text-accent" : "text-fg-muted"} />
      <span className="text-sm font-medium mt-0.5">{title}</span>
      <span className="text-[11px] text-fg-muted">{sub}</span>
    </button>
  );
}

/* ── Task step ────────────────────────────────────────────────────────── */

function TaskStep({
  companies, companyId, setCompanyId, actionItem, setActionItem,
  priority, setPriority, deadline, setDeadline, assignees, setAssignees,
  onBack, onSave, saving, error,
}: {
  companies: Company[];
  companyId: string; setCompanyId: (v: string) => void;
  actionItem: string; setActionItem: (v: string) => void;
  priority: string; setPriority: (v: string) => void;
  deadline: string; setDeadline: (v: string) => void;
  assignees: string; setAssignees: (v: string) => void;
  onBack: () => void; onSave: () => void; saving: boolean; error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">The task</label>
        <input
          value={actionItem}
          onChange={(e) => setActionItem(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">Which company?</label>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="">Select company…</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">When&apos;s it due?</label>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Today", val: quickDate("today") },
            { label: "This week", val: quickDate("week") },
            { label: "Next week", val: quickDate("nextweek") },
            { label: "No date", val: "" },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setDeadline(q.val)}
              className={cn(
                "text-xs rounded-full border px-3 py-1.5 transition-colors",
                deadline === q.val ? "border-accent bg-accent/10 text-accent" : "border-border text-fg-muted hover:border-accent/50"
              )}
            >
              {q.label}
            </button>
          ))}
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="text-xs rounded-full border border-border bg-bg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">Priority</label>
        <div className="flex gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                "flex-1 text-xs rounded-lg border px-2 py-1.5 transition-colors",
                priority === p ? "border-accent bg-accent/10 text-accent font-medium" : "border-border text-fg-muted hover:border-accent/50"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">Owner (optional)</label>
        <input
          value={assignees}
          onChange={(e) => setAssignees(e.target.value)}
          placeholder="e.g. Shivam"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <StepFooter onBack={onBack} onSave={onSave} saving={saving} saveLabel="Create task" />
    </div>
  );
}

/* ── Note step ────────────────────────────────────────────────────────── */

function NoteStep({
  companies, title, setTitle, companyId, setCompanyId, body, setBody,
  onBack, onSave, saving, error,
}: {
  companies: Company[];
  title: string; setTitle: (v: string) => void;
  companyId: string; setCompanyId: (v: string) => void;
  body: string; setBody: (v: string) => void;
  onBack: () => void; onSave: () => void; saving: boolean; error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">Which company? (optional)</label>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="">No company</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-fg-muted">Note</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <p className="text-[11px] text-fg-subtle">Saved to Meeting Workspace as business memory.</p>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <StepFooter onBack={onBack} onSave={onSave} saving={saving} saveLabel="Save note" />
    </div>
  );
}

function StepFooter({ onBack, onSave, saving, saveLabel }: { onBack: () => void; onSave: () => void; saving: boolean; saveLabel: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-fg-muted hover:text-fg transition-colors"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} {saveLabel}
      </button>
    </div>
  );
}

/* ── Done step ────────────────────────────────────────────────────────── */

function DoneStep({
  result, onClose, onAnother, onOpen,
}: {
  result: { kind: Kind; label: string; href: string };
  onClose: () => void; onAnother: () => void; onOpen: () => void;
}) {
  return (
    <div className="py-4 text-center space-y-4">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-success/10">
        <CheckCircle2 size={26} className="text-success" />
      </div>
      <div>
        <p className="text-sm font-medium">
          {result.kind === "task" ? "Task created" : "Note saved"}
        </p>
        <p className="text-xs text-fg-muted mt-0.5">{result.label}</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <ExternalLink size={14} /> Open
        </button>
        <button
          type="button"
          onClick={onAnother}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-fg-muted hover:text-fg transition-colors"
        >
          Capture another
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-lg text-sm text-fg-muted hover:text-fg transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
