"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2, CheckSquare, ChevronDown, ChevronUp, FileText, Loader2, Plus,
  Search, Save, Sparkles, Square, Trash2, Wand2, ArrowLeft, ListChecks,
  AlertTriangle, MessageSquareQuote, X, Mic,
} from "lucide-react";
import {
  bulkCreateTasks, generateMeetingInsight, generateMeetingMinutes, improveMeetingNotes,
  listMeetings, parseMeetingNotes, saveMeeting, type BulkTaskInput, type SavedMeeting,
} from "@/app/meeting/actions";
import type { MeetingTask } from "@/lib/meeting-parse";
import { polishActionItem } from "@/lib/smart-parse";
import { VoiceButton } from "@/components/voice-button";
import { polishDictation, teachVoiceDictionary } from "@/app/voice/actions";
import { cn } from "@/lib/cn";

const fieldCls = "w-full rounded-lg bg-bg-subtle border border-border/60 px-3 py-2 text-sm transition-colors focus:outline-none focus:border-accent focus:bg-bg";
const labelCls = "text-[11px] uppercase tracking-wide text-fg-subtle";

const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const CATEGORIES = ["Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other"];

type EditableTask = BulkTaskInput & { id: string; checked: boolean; deadlineLabel?: string | null };
type Props = { companies: { id: number; name: string }[]; meetings: SavedMeeting[]; voiceLanguage?: string };
type Pane = "notes" | "minutes";

function todayIso() { return new Date().toISOString().slice(0, 10); }

function taskFromParsed(p: MeetingTask, idx: number): EditableTask {
  return {
    id: `t-${idx}`, checked: true, meetingId: null, companyId: p.companyId ?? 0,
    actionItem: p.actionItem, priority: p.priority, status: p.status,
    deadline: p.deadline ? p.deadline.toISOString().slice(0, 10) : null,
    deadlineLabel: p.deadlineLabel, assigneeNames: p.assigneeNames,
    category: p.category, escalation: p.escalation,
  };
}

export function MeetingExtractor({ companies, meetings, voiceLanguage = "en-GB" }: Props) {
  const router = useRouter();

  const [meetingList, setMeetingList] = useState<SavedMeeting[]>(meetings);
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false); // mobile: show editor vs list
  const [pane, setPane] = useState<Pane>("notes");

  const [title, setTitle] = useState("New meeting");
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [attendees, setAttendees] = useState("");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const notesRef = useRef("");
  const [defaultCompany, setDefaultCompany] = useState<number>(0);

  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [saveFailures, setSaveFailures] = useState<{ actionItem: string; reason: string }[]>([]);

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdTaskLinks, setCreatedTaskLinks] = useState<SavedMeeting["tasks"]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyCompany, setHistoryCompany] = useState<number>(0);
  const [lastRawVoice, setLastRawVoice] = useState<string | null>(null);
  const [voiceTerm, setVoiceTerm] = useState("");
  const [showTeach, setShowTeach] = useState(false);

  const [isParsing, startParse] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isSavingMeeting, startSaveMeeting] = useTransition();
  const [busyAssist, startAssist] = useTransition();
  const [isPolishingVoice, startVoicePolish] = useTransition();
  const [isTeachingVoice, startTeachVoice] = useTransition();

  const updateNotes = useCallback((v: string) => { notesRef.current = v; setNotes(v); }, []);
  const appendNotes = useCallback((chunk: string) => {
    const next = notesRef.current ? `${notesRef.current}\n${chunk}` : chunk;
    notesRef.current = next; setNotes(next);
  }, []);
  const showNotesInterim = useCallback((chunk: string) => {
    setNotes(notesRef.current ? `${notesRef.current}\n${chunk}` : chunk);
  }, []);

  function flash(msg: string) { setInfo(msg); }

  function handleVoiceStop() {
    const raw = notesRef.current;
    if (!raw.trim()) return;
    setLastRawVoice(raw);
    flash("Cleaning dictated notes…");
    startVoicePolish(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? "Group-wide";
      const result = await polishDictation({
        text: raw, mode: "note", language: voiceLanguage,
        context: `Meeting: ${title}. Company: ${companyName}. Attendees: ${attendees || "not specified"}. Date: ${meetingDate}.`,
      });
      updateNotes(result.polished);
      const tidied = result.changes ? ` Tidied ${result.changes} thing${result.changes === 1 ? "" : "s"}.` : "";
      flash(result.source === "ai" ? `Dictation polished by COS.${tidied}` : result.source === "no-key" ? "AI is off — applied basic clean-up." : result.source === "error" ? "AI clean-up failed — applied basic clean-up." : "Dictation cleaned.");
    });
  }

  function handleTeachVoice() {
    startTeachVoice(async () => {
      const result = await teachVoiceDictionary(voiceTerm);
      flash(result.message);
      if (result.saved) { setVoiceTerm(""); setShowTeach(false); }
    });
  }

  function resetEditorState() {
    setTasks([]); setExpandedId(null); setSavedCount(null); setSaveFailures([]);
    setError(null); setInfo(null); setPane("notes");
  }

  function loadMeeting(m: SavedMeeting) {
    setMeetingId(m.id); setTitle(m.title); setDefaultCompany(m.companyId ?? 0);
    setMeetingDate(m.meetingDate); setAttendees(m.attendees ?? ""); setMinutes(m.minutes ?? "");
    updateNotes(m.rawNotes); resetEditorState();
    setCreatedTaskLinks(m.tasks); setEditing(true);
  }

  function startNewMeeting() {
    setMeetingId(null); setTitle("New meeting"); setDefaultCompany(0);
    setMeetingDate(todayIso()); setAttendees(""); setMinutes(""); updateNotes("");
    resetEditorState(); setCreatedTaskLinks([]); setEditing(true);
  }

  function upsertMeetingList(saved: SavedMeeting) {
    setMeetingList(prev => [saved, ...prev.filter(m => m.id !== saved.id)]);
  }

  function handleSaveMeeting() {
    setError(null);
    startSaveMeeting(async () => {
      try {
        const saved = await saveMeeting({ id: meetingId, title, companyId: defaultCompany || null, meetingDate, attendees, rawNotes: notes, minutes });
        setMeetingId(saved.id); setTitle(saved.title); setMeetingDate(saved.meetingDate);
        setAttendees(saved.attendees ?? ""); setMinutes(saved.minutes ?? ""); updateNotes(saved.rawNotes);
        upsertMeetingList(saved); setCreatedTaskLinks(saved.tasks); flash("Meeting saved.");
        router.refresh();
      } catch (err) { setError(err instanceof Error ? err.message : "Could not save meeting."); }
    });
  }

  function assistGenerateMinutes() {
    setError(null);
    startAssist(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? null;
      const result = await generateMeetingMinutes({ title, companyName, attendees, rawNotes: notes });
      if (result.minutes) setMinutes(result.minutes);
      setPane("minutes");
      flash(result.source === "ai" ? "Minutes generated by AI." : result.source === "no-key" ? "AI is off — used the basic minutes builder." : result.source === "error" ? "AI minutes failed — used the basic builder." : (result.message || "Minutes generated."));
    });
  }

  function assistCleanNotes() {
    setError(null);
    startAssist(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? null;
      const result = await improveMeetingNotes({ title, companyName, rawNotes: notes });
      if (result.notes) updateNotes(result.notes);
      setPane("notes");
      flash(result.source === "ai" ? "Notes cleaned by AI." : result.source === "no-key" ? "AI is off — used the basic cleaner." : result.source === "error" ? "AI clean-up failed — used the basic cleaner." : (result.message || "Notes cleaned."));
    });
  }

  function assistInsight(kind: "decisions" | "risks" | "follow-up") {
    setError(null);
    startAssist(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? null;
      const result = await generateMeetingInsight({ kind, title, companyName, attendees, rawNotes: notes, minutes });
      const label = kind === "decisions" ? "Decisions" : kind === "risks" ? "Risks" : "Follow-up draft";
      if (result.text) {
        // Insights merge into the minutes document so everything lives in one place.
        setMinutes(prev => (prev.trim() ? `${prev.trim()}\n\n${label}\n${result.text}` : `${label}\n${result.text}`));
        setPane("minutes");
      }
      flash(result.source === "ai" ? `${label} added by AI.` : result.source === "no-key" ? `AI is off — used the basic ${label.toLowerCase()} builder.` : result.source === "error" ? `AI ${label.toLowerCase()} failed — used the basic builder.` : (result.message || `${label} added.`));
    });
  }

  function handleExtract() {
    if (!notes.trim()) return;
    setError(null); setSavedCount(null); setSaveFailures([]);
    setTasksOpen(true);
    startParse(async () => {
      const { tasks: parsed, source, aiError } = await parseMeetingNotes(notes, defaultCompany || undefined);
      setTasks(parsed.map((p, i) => taskFromParsed(p, i)));
      if (parsed.length === 0) setError("No action items detected. Try bullet points like 'Amina to send invoice by Friday'.");
      if (source === "rules-no-key") flash("AI extraction is off — used the basic extractor.");
      else if (source === "rules-ai-error") flash(`AI extraction failed (${aiError || "unknown"}) — used the basic extractor.`);
      else if (source === "rules-empty-ai") flash("AI returned no items — tried the basic extractor.");
    });
  }

  const updateTask = (id: string, patch: Partial<EditableTask>) => setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  const removeTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  function addBlank() {
    const id = `t-manual-${Date.now()}`;
    setTasks(prev => [...prev, { id, checked: true, meetingId, companyId: defaultCompany || companies[0]?.id || 0, actionItem: "", priority: "Low", status: "Not Started", deadline: null, deadlineLabel: null, assigneeNames: [], category: null, escalation: "No" }]);
    setExpandedId(id);
  }

  function handleSave() {
    const toSave = tasks.filter(t => t.checked && t.actionItem.trim() && t.companyId).map(t => ({ ...t, meetingId }));
    if (!toSave.length) { setError("Select at least one task with a company and action item."); return; }
    setError(null);
    startSave(async () => {
      const { created, failures } = await bulkCreateTasks(toSave);
      setSavedCount(created);
      setSaveFailures(failures.map(f => ({ actionItem: f.actionItem, reason: f.reason })));
      if (failures.length === 0) { setTasks([]); setTasksOpen(false); }
      else { const failed = new Set(failures.map(f => f.actionItem)); setTasks(prev => prev.filter(t => failed.has(t.actionItem))); }
      if (meetingId) {
        const fresh = await listMeetings();
        setMeetingList(fresh);
        setCreatedTaskLinks(fresh.find(m => m.id === meetingId)?.tasks ?? []);
        flash("Tasks created and linked to this meeting.");
      }
      router.refresh();
    });
  }

  const checkedCount = tasks.filter(t => t.checked).length;
  const allChecked = tasks.length > 0 && tasks.every(t => t.checked);
  const needsReview = tasks.filter(t => t.checked && (!t.companyId || !t.actionItem.trim())).length;
  const toggleAll = () => { const next = !allChecked; setTasks(prev => prev.map(t => ({ ...t, checked: next }))); };

  const filteredMeetings = meetingList.filter(m => {
    const q = historyQuery.trim().toLowerCase();
    const matchesCompany = !historyCompany || m.companyId === historyCompany;
    const hay = `${m.title} ${m.companyName ?? ""} ${m.attendees ?? ""} ${m.rawNotes} ${m.minutes ?? ""}`.toLowerCase();
    return matchesCompany && (!q || hay.includes(q));
  });

  const linkedTasks = createdTaskLinks.length ? createdTaskLinks : (meetingId ? meetingList.find(m => m.id === meetingId)?.tasks ?? [] : []);

  return (
    <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-4 rounded-2xl border border-border overflow-hidden min-h-[68vh] bg-bg-elev">
      {/* History pane */}
      <div className={cn("flex flex-col border-border lg:border-r", editing ? "hidden lg:flex" : "flex")}>
        <div className="p-3 space-y-2 border-b border-border">
          <button type="button" onClick={startNewMeeting} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent text-accent-fg text-sm font-medium px-3 py-2 hover:opacity-90 transition-opacity">
            <Plus size={14} /> New meeting
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={historyQuery} onChange={e => setHistoryQuery(e.target.value)} placeholder="Search meetings" className="w-full rounded-lg border border-border bg-bg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
          </div>
          <select value={historyCompany} onChange={e => setHistoryCompany(Number(e.target.value))} className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40">
            <option value={0}>All companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredMeetings.length === 0 ? (
            <div className="py-12 text-center text-sm text-fg-muted px-4">{meetingList.length === 0 ? "No meetings yet." : "No meetings match."}</div>
          ) : filteredMeetings.map(m => (
            <button key={m.id} type="button" onClick={() => loadMeeting(m)} className={cn("w-full text-left px-3 py-2.5 border-b border-border/60 transition-colors", meetingId === m.id ? "bg-accent/10" : "hover:bg-bg-muted/50")}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate flex-1">{m.title}</span>
                {m.taskCount > 0 && <span className="text-[10px] rounded-full bg-bg-muted px-1.5 py-0.5 text-fg-muted shrink-0">{m.taskCount}</span>}
              </div>
              <p className="text-xs text-fg-muted truncate mt-0.5">{m.companyName || "Group-wide"} · {m.meetingDate}</p>
              {m.minutes && <span className="text-[10px] text-success">Minutes saved</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Editor pane */}
      <div className={cn("flex flex-col", editing ? "flex" : "hidden lg:flex")}>
        {!editing ? (
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center p-8">
            <FileText size={28} className="text-fg-subtle mb-3" />
            <p className="text-sm text-fg-muted">Select a meeting, or start a new one.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
              <button type="button" onClick={() => setEditing(false)} className="lg:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg text-fg-muted hover:bg-bg-muted" aria-label="Back">
                <ArrowLeft size={16} />
              </button>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title" className="flex-1 min-w-0 bg-transparent text-base font-semibold outline-none placeholder:text-fg-subtle" />
              <AssistMenu busy={busyAssist} hasNotes={!!notes.trim()} hasContent={!!notes.trim() || !!minutes.trim()}
                onClean={assistCleanNotes} onMinutes={assistGenerateMinutes}
                onDecisions={() => assistInsight("decisions")} onRisks={() => assistInsight("risks")}
                onFollowUp={() => assistInsight("follow-up")} onExtract={handleExtract} />
              <button type="button" onClick={handleSaveMeeting} disabled={isSavingMeeting} className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium px-3 py-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity">
                {isSavingMeeting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
              </button>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/60 text-xs">
              <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className="rounded-lg border border-border bg-bg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent/40" />
              <select value={defaultCompany} onChange={e => setDefaultCompany(Number(e.target.value))} className="rounded-lg border border-border bg-bg px-2 py-1 text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40">
                <option value={0}>Group-wide</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="Attendees" className="flex-1 min-w-[120px] rounded-lg border border-border bg-bg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent/40" />
            </div>

            {/* Notes | Minutes sub-toggle */}
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-bg-muted/60 border border-border">
                <SubTab active={pane === "notes"} onClick={() => setPane("notes")} label="Notes" />
                <SubTab active={pane === "minutes"} onClick={() => setPane("minutes")} label="Minutes" />
              </div>
              {linkedTasks.length > 0 && (
                <button type="button" onClick={() => setTasksOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent">
                  <ListChecks size={13} /> {linkedTasks.length} task{linkedTasks.length === 1 ? "" : "s"}
                </button>
              )}
            </div>

            {/* Editor body */}
            <div className="flex-1 flex flex-col px-3 pb-3">
              {pane === "notes" ? (
                <div className="flex-1 flex flex-col">
                  <textarea
                    value={notes}
                    onChange={e => updateNotes(e.target.value)}
                    placeholder={`Type, paste, or dictate the meeting…\n\n- Review packaging contract by month end\n- Shivam to follow up on invoice (urgent)\n- Schedule quality inspection next week`}
                    className="flex-1 min-h-[34vh] w-full resize-none rounded-xl border border-border bg-bg p-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                  <div className="flex items-center gap-2 pt-2">
                    <VoiceButton disabled={isParsing || isPolishingVoice} onResult={appendNotes} onInterim={showNotesInterim} onStop={handleVoiceStop} lang={voiceLanguage} title="Dictate notes" />
                    <button type="button" onClick={handleExtract} disabled={!notes.trim() || isParsing} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50">
                      {isParsing ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Extract tasks
                    </button>
                    <button type="button" onClick={() => setShowTeach(s => !s)} className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg">
                      <Mic size={12} /> Teach a word
                    </button>
                  </div>
                  {showTeach && (
                    <div className="flex gap-2 pt-2">
                      <input value={voiceTerm} onChange={e => setVoiceTerm(e.target.value)} placeholder="Name or phrase COS should remember" className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent" />
                      <button type="button" onClick={handleTeachVoice} disabled={isTeachingVoice || !voiceTerm.trim()} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50">
                        {isTeachingVoice ? "Saving…" : "Teach"}
                      </button>
                    </div>
                  )}
                  {lastRawVoice && (
                    <button type="button" onClick={() => updateNotes(lastRawVoice)} className="self-start pt-1 text-xs text-accent hover:underline">Use raw dictation</button>
                  )}
                </div>
              ) : (
                <textarea
                  value={minutes}
                  onChange={e => setMinutes(e.target.value)}
                  placeholder="Use ✨ Assist → Generate minutes, or write them here. Decisions, risks and follow-ups land here too."
                  className="flex-1 min-h-[34vh] w-full resize-none rounded-xl border border-border bg-bg p-3 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              )}

              {(info || error) && (
                <p className={cn("text-xs pt-2", error ? "text-danger" : "text-fg-muted")}>
                  {error || info}
                  {isPolishingVoice && <Loader2 size={11} className="inline ml-1 animate-spin" />}
                </p>
              )}
              {savedCount !== null && !error && (
                <p className="text-xs text-success pt-1 inline-flex items-center gap-1"><CheckCircle2 size={12} /> {savedCount} task{savedCount !== 1 ? "s" : ""} created.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tasks slide-over */}
      <TasksDrawer
        open={tasksOpen} onClose={() => setTasksOpen(false)}
        tasks={tasks} companies={companies}
        isParsing={isParsing} isSaving={isSaving}
        checkedCount={checkedCount} allChecked={allChecked} needsReview={needsReview}
        expandedId={expandedId} setExpandedId={setExpandedId}
        updateTask={updateTask} removeTask={removeTask} addBlank={addBlank}
        toggleAll={toggleAll} onSave={handleSave}
        linkedTasks={linkedTasks} saveFailures={saveFailures} error={error}
      />
    </div>
  );
}

/* ── Sub-toggle button ──────────────────────────────────────────────────── */
function SubTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("px-3 py-1 text-xs rounded-md transition-colors", active ? "bg-bg-elev text-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg")}>
      {label}
    </button>
  );
}

/* ── Assist dropdown ────────────────────────────────────────────────────── */
function AssistMenu({
  busy, hasNotes, hasContent, onClean, onMinutes, onDecisions, onRisks, onFollowUp, onExtract,
}: {
  busy: boolean; hasNotes: boolean; hasContent: boolean;
  onClean: () => void; onMinutes: () => void; onDecisions: () => void; onRisks: () => void; onFollowUp: () => void; onExtract: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, disabled = false) => (
    <button type="button" disabled={disabled} onClick={() => { setOpen(false); onClick(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-bg-muted disabled:opacity-40 transition-colors">
      {icon} {label}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg hover:border-accent/50 transition-colors">
        {busy ? <Loader2 size={13} className="animate-spin text-accent" /> : <Sparkles size={13} className="text-accent" />} Assist
        <ChevronDown size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
            className="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl vibrancy-strong shadow-lg overflow-hidden py-1">
            {item(<Sparkles size={14} className="text-accent" />, "Clean up notes", onClean, !hasNotes)}
            {item(<FileText size={14} className="text-accent" />, "Generate minutes", onMinutes, !hasNotes)}
            <div className="my-1 border-t border-border" />
            {item(<CheckCircle2 size={14} className="text-fg-muted" />, "Extract decisions", onDecisions, !hasContent)}
            {item(<AlertTriangle size={14} className="text-fg-muted" />, "Extract risks", onRisks, !hasContent)}
            {item(<MessageSquareQuote size={14} className="text-fg-muted" />, "Draft follow-up", onFollowUp, !hasContent)}
            <div className="my-1 border-t border-border" />
            {item(<Wand2 size={14} className="text-accent" />, "Extract tasks", onExtract, !hasNotes)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Tasks slide-over ───────────────────────────────────────────────────── */
function TasksDrawer({
  open, onClose, tasks, companies, isParsing, isSaving, checkedCount, allChecked, needsReview,
  expandedId, setExpandedId, updateTask, removeTask, addBlank, toggleAll, onSave, linkedTasks, saveFailures, error,
}: {
  open: boolean; onClose: () => void; tasks: EditableTask[]; companies: { id: number; name: string }[];
  isParsing: boolean; isSaving: boolean; checkedCount: number; allChecked: boolean; needsReview: number;
  expandedId: string | null; setExpandedId: (v: string | null) => void;
  updateTask: (id: string, patch: Partial<EditableTask>) => void; removeTask: (id: string) => void;
  addBlank: () => void; toggleAll: () => void; onSave: () => void;
  linkedTasks: SavedMeeting["tasks"]; saveFailures: { actionItem: string; reason: string }[]; error: string | null;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="fixed inset-0 m-auto z-[61] h-fit max-h-[85svh] w-[calc(100%-1.5rem)] max-w-md flex flex-col overflow-hidden vibrancy-strong rounded-2xl shadow-lg">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
              <h2 className="text-sm font-semibold inline-flex items-center gap-2"><ListChecks size={15} className="text-accent" /> Action items</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="h-7 w-7 inline-flex items-center justify-center rounded-full text-fg-muted hover:bg-bg-muted"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {isParsing && tasks.length === 0 && (
                <div className="py-10 text-center text-sm text-fg-muted inline-flex items-center justify-center gap-2 w-full"><Loader2 size={14} className="animate-spin" /> Finding action items…</div>
              )}

              {tasks.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <button onClick={toggleAll} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
                    {allChecked ? <CheckSquare size={13} /> : <Square size={13} />} {checkedCount} of {tasks.length}
                  </button>
                  <button onClick={addBlank} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-2.5 py-1"><Plus size={12} /> Add</button>
                </div>
              )}

              {tasks.map(task => {
                const isExpanded = expandedId === task.id;
                const hasIssue = !task.companyId || !task.actionItem.trim();
                const stripe = task.priority === "Critical" ? "bg-danger" : task.priority === "High" ? "bg-warn" : task.priority === "Medium" ? "bg-accent" : "bg-border";
                return (
                  <div key={task.id} className={cn("relative overflow-hidden rounded-xl border bg-bg-elev", !task.checked && "opacity-50", hasIssue ? "border-warn/40" : "border-border")}>
                    <span className={`absolute left-0 top-0 bottom-0 w-1 ${stripe}`} />
                    <div className="flex items-center gap-2.5 p-2.5 pl-3.5">
                      <input type="checkbox" checked={task.checked} onChange={e => updateTask(task.id, { checked: e.target.checked })} className="accent-[var(--accent)] w-4 h-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <input type="text" value={task.actionItem} onChange={e => updateTask(task.id, { actionItem: e.target.value })}
                          onBlur={async e => {
                            const rulebased = polishActionItem(e.target.value);
                            updateTask(task.id, { actionItem: rulebased });
                            try { const res = await fetch("/api/polish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: e.target.value }) }); const { result } = await res.json(); if (result?.trim()) updateTask(task.id, { actionItem: result }); } catch {}
                          }}
                          placeholder="Action item…" className="w-full bg-transparent text-sm focus:outline-none placeholder:text-fg-muted" />
                        <div className="flex flex-wrap gap-2 mt-0.5">
                          {task.companyId ? <span className="text-[11px] text-fg-muted">{companies.find(c => c.id === task.companyId)?.name}</span> : <span className="text-[11px] text-warn">No company</span>}
                          {task.deadline && <span className="text-[11px] text-fg-muted">Due {task.deadlineLabel || task.deadline}</span>}
                          {task.priority !== "Low" && <span className="text-[11px] text-fg-muted">{task.priority}</span>}
                        </div>
                      </div>
                      <button onClick={() => setExpandedId(isExpanded ? null : task.id)} className="p-1.5 rounded text-fg-muted hover:text-fg" title="Details">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
                      <button onClick={() => removeTask(task.id)} className="p-1.5 rounded text-fg-muted hover:text-danger" title="Remove"><Trash2 size={14} /></button>
                    </div>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                          <div className="border-t border-border px-3.5 pb-3 pt-2.5 grid grid-cols-2 gap-2.5">
                            <div className="space-y-1 col-span-2">
                              <label className={labelCls}>Company *</label>
                              <select value={task.companyId} onChange={e => updateTask(task.id, { companyId: Number(e.target.value) })} className={fieldCls}>
                                <option value={0}>Select company…</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1"><label className={labelCls}>Priority</label><select value={task.priority} onChange={e => updateTask(task.id, { priority: e.target.value })} className={fieldCls}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></div>
                            <div className="space-y-1"><label className={labelCls}>Status</label><select value={task.status} onChange={e => updateTask(task.id, { status: e.target.value })} className={fieldCls}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
                            <div className="space-y-1"><label className={labelCls}>Deadline</label><input type="date" value={task.deadline || ""} onChange={e => updateTask(task.id, { deadline: e.target.value || null, deadlineLabel: null })} className={fieldCls} /></div>
                            <div className="space-y-1"><label className={labelCls}>Category</label><select value={task.category || ""} onChange={e => updateTask(task.id, { category: e.target.value || null })} className={fieldCls}><option value="">None</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                            <div className="space-y-1 col-span-2"><label className={labelCls}>Assigned to</label><input type="text" value={task.assigneeNames.join(", ")} onChange={e => updateTask(task.id, { assigneeNames: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} placeholder="comma-separated" className={fieldCls} /></div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {saveFailures.length > 0 && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs">
                  <p className="font-medium text-danger mb-1">{saveFailures.length} failed to save</p>
                  <ul className="space-y-0.5 text-fg-muted">{saveFailures.map((f, i) => <li key={i}>{f.actionItem || "(empty)"} — {f.reason}</li>)}</ul>
                </div>
              )}

              {/* Already-linked tasks */}
              {linkedTasks.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <p className="text-[11px] uppercase tracking-wider text-fg-subtle">Linked to this meeting</p>
                  {linkedTasks.map(t => (
                    <Link key={t.id} href={`/task/${t.code}`} className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 hover:border-accent/50 transition-colors">
                      <div className="min-w-0"><span className="font-mono text-[11px] text-accent">{t.code}</span><p className="truncate text-sm group-hover:text-accent">{t.actionItem}</p></div>
                      <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[10px] text-fg-muted">{t.status}</span>
                    </Link>
                  ))}
                </div>
              )}

              {!isParsing && tasks.length === 0 && linkedTasks.length === 0 && (
                <div className="py-10 text-center text-sm text-fg-muted">No action items yet. Use ✨ Assist → Extract tasks.</div>
              )}
            </div>

            {tasks.length > 0 && (
              <div className="border-t border-border p-3 shrink-0">
                <button onClick={onSave} disabled={!checkedCount || isSaving} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-fg text-sm font-medium px-4 py-2.5 disabled:opacity-50 hover:opacity-90 transition-opacity">
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {isSaving ? "Creating…" : `Create ${checkedCount} task${checkedCount !== 1 ? "s" : ""}`}{needsReview ? ` · ${needsReview} need review` : ""}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
