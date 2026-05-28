"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  Loader2,
  Plus,
  Search,
  Save,
  Sparkles,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  bulkCreateTasks,
  generateMeetingInsight,
  generateMeetingMinutes,
  improveMeetingNotes,
  listMeetings,
  parseMeetingNotes,
  saveMeeting,
  type BulkTaskInput,
  type SavedMeeting,
} from "@/app/meeting/actions";
import type { MeetingTask } from "@/lib/meeting-parse";
import { polishActionItem } from "@/lib/smart-parse";
import { PromptBox } from "@/components/prompt-box";
import { VoiceButton } from "@/components/voice-button";
import { polishDictation, teachVoiceDictionary } from "@/app/voice/actions";

const fieldCls =
  "w-full rounded-lg bg-bg-subtle border border-border/60 px-3 py-2 text-sm transition-colors focus:outline-none focus:border-accent focus:bg-bg";
const labelCls = "text-[11px] uppercase tracking-wide text-fg-subtle";

const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const CATEGORIES = ["Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other"];

type EditableTask = BulkTaskInput & { id: string; checked: boolean; deadlineLabel?: string | null };
type Props = { companies: { id: number; name: string }[]; meetings: SavedMeeting[]; voiceLanguage?: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function taskFromParsed(p: MeetingTask, idx: number): EditableTask {
  return {
    id: `t-${idx}`,
    checked: true,
    meetingId: null,
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

export function MeetingExtractor({ companies, meetings, voiceLanguage = "en-GB" }: Props) {
  const router = useRouter();

  const [meetingList, setMeetingList] = useState<SavedMeeting[]>(meetings);
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const [title, setTitle] = useState("New meeting");
  const [meetingDate, setMeetingDate] = useState(todayIso());
  const [attendees, setAttendees] = useState("");
  const [minutes, setMinutes] = useState("");
  const [insight, setInsight] = useState("");
  const [notes, setNotes] = useState("");
  const notesRef = useRef("");

  const [defaultCompany, setDefaultCompany] = useState<number>(0);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [saveFailures, setSaveFailures] = useState<{ actionItem: string; reason: string }[]>([]);
  const [parseInfo, setParseInfo] = useState<string | null>(null);
  const [minutesInfo, setMinutesInfo] = useState<string | null>(null);
  const [meetingNotice, setMeetingNotice] = useState<string | null>(null);
  const [createdTaskLinks, setCreatedTaskLinks] = useState<SavedMeeting["tasks"]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyCompany, setHistoryCompany] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [lastRawVoice, setLastRawVoice] = useState<string | null>(null);
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null);
  const [voiceTerm, setVoiceTerm] = useState("");

  const [isParsing, startParse] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isSavingMeeting, startSaveMeeting] = useTransition();
  const [isGeneratingMinutes, startMinutes] = useTransition();
  const [isCleaningNotes, startCleanNotes] = useTransition();
  const [isGeneratingInsight, startInsight] = useTransition();
  const [isPolishingVoice, startVoicePolish] = useTransition();
  const [isTeachingVoice, startTeachVoice] = useTransition();

  const updateNotes = useCallback((v: string) => {
    notesRef.current = v;
    setNotes(v);
  }, []);

  const appendNotes = useCallback((chunk: string) => {
    const next = notesRef.current ? `${notesRef.current}\n${chunk}` : chunk;
    notesRef.current = next;
    setNotes(next);
  }, []);

  function handleVoiceStop() {
    const raw = notesRef.current;
    if (!raw.trim()) return;
    setLastRawVoice(raw);
    setVoiceInfo("Cleaning dictated notes...");
    startVoicePolish(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? "Group-wide";
      const result = await polishDictation({
        text: raw,
        mode: "note",
        language: voiceLanguage,
        context: `Meeting: ${title}. Company: ${companyName}. Attendees: ${attendees || "not specified"}. Date: ${meetingDate}.`,
      });
      updateNotes(result.polished);
      if (result.source === "ai") setVoiceInfo("Dictation polished by COS.");
      else if (result.source === "no-key") setVoiceInfo("AI is off, so COS applied basic clean-up.");
      else if (result.source === "error") setVoiceInfo("AI clean-up failed, so COS applied basic clean-up.");
      else setVoiceInfo("Dictation cleaned.");
    });
  }

  function handleTeachVoice() {
    startTeachVoice(async () => {
      const result = await teachVoiceDictionary(voiceTerm);
      setVoiceInfo(result.message);
      if (result.saved) setVoiceTerm("");
    });
  }

  function loadMeeting(m: SavedMeeting) {
    setMeetingId(m.id);
    setTitle(m.title);
    setDefaultCompany(m.companyId ?? 0);
    setMeetingDate(m.meetingDate);
    setAttendees(m.attendees ?? "");
    setMinutes(m.minutes ?? "");
    setInsight("");
    updateNotes(m.rawNotes);
    setTasks([]);
    setExpandedId(null);
    setSavedCount(null);
    setSaveFailures([]);
    setError(null);
    setParseInfo(null);
    setMeetingNotice(`Opened ${m.title}.`);
    setCreatedTaskLinks(m.tasks);
  }

  function startNewMeeting() {
    setMeetingId(null);
    setTitle("New meeting");
    setDefaultCompany(0);
    setMeetingDate(todayIso());
    setAttendees("");
    setMinutes("");
    setInsight("");
    updateNotes("");
    setTasks([]);
    setExpandedId(null);
    setSavedCount(null);
    setSaveFailures([]);
    setError(null);
    setParseInfo(null);
    setMeetingNotice("Started a new meeting.");
    setCreatedTaskLinks([]);
  }

  function upsertMeetingList(saved: SavedMeeting) {
    setMeetingList(prev => [saved, ...prev.filter(m => m.id !== saved.id)]);
  }

  function handleSaveMeeting() {
    setError(null);
    setMeetingNotice(null);
    startSaveMeeting(async () => {
      try {
        const saved = await saveMeeting({
          id: meetingId,
          title,
          companyId: defaultCompany || null,
          meetingDate,
          attendees,
          rawNotes: notes,
          minutes,
        });
        setMeetingId(saved.id);
        setTitle(saved.title);
        setMeetingDate(saved.meetingDate);
        setAttendees(saved.attendees ?? "");
        setMinutes(saved.minutes ?? "");
        updateNotes(saved.rawNotes);
        upsertMeetingList(saved);
        setMeetingNotice("Meeting saved.");
        setCreatedTaskLinks(saved.tasks);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save meeting.");
      }
    });
  }

  function handleGenerateMinutes() {
    setError(null);
    setMinutesInfo(null);
    startMinutes(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? null;
      const result = await generateMeetingMinutes({ title, companyName, attendees, rawNotes: notes });
      if (result.minutes) setMinutes(result.minutes);
      if (result.source === "ai") setMinutesInfo("Minutes generated by AI.");
      else if (result.source === "no-key") setMinutesInfo("AI is off, so I used the basic minutes builder.");
      else if (result.source === "error") setMinutesInfo(`AI minutes failed${result.message ? ` (${result.message})` : ""}; used the basic minutes builder.`);
      else if (result.message) setMinutesInfo(result.message);
    });
  }

  function handleCleanNotes() {
    setError(null);
    setParseInfo(null);
    startCleanNotes(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? null;
      const result = await improveMeetingNotes({ title, companyName, rawNotes: notes });
      if (result.notes) updateNotes(result.notes);
      if (result.source === "ai") setParseInfo("Notes cleaned by AI.");
      else if (result.source === "no-key") setParseInfo("AI is off, so I used the basic notes cleaner.");
      else if (result.source === "error") setParseInfo(`AI notes clean-up failed${result.message ? ` (${result.message})` : ""}; used the basic cleaner.`);
      else if (result.message) setParseInfo(result.message);
    });
  }

  function handleInsight(kind: "decisions" | "risks" | "follow-up") {
    setError(null);
    setMinutesInfo(null);
    startInsight(async () => {
      const companyName = companies.find(c => c.id === defaultCompany)?.name ?? null;
      const result = await generateMeetingInsight({ kind, title, companyName, attendees, rawNotes: notes, minutes });
      if (result.text) setInsight(result.text);
      const label = kind === "decisions" ? "Decisions" : kind === "risks" ? "Risks" : "Follow-up draft";
      if (result.source === "ai") setMinutesInfo(`${label} generated by AI.`);
      else if (result.source === "no-key") setMinutesInfo(`AI is off, so I used the basic ${label.toLowerCase()} builder.`);
      else if (result.source === "error") setMinutesInfo(`AI ${label.toLowerCase()} failed${result.message ? ` (${result.message})` : ""}; used the basic builder.`);
      else if (result.message) setMinutesInfo(result.message);
    });
  }

  function handleExtract() {
    if (!notes.trim()) return;
    setError(null);
    setSavedCount(null);
    setSaveFailures([]);
    setParseInfo(null);
    startParse(async () => {
      const { tasks: parsed, source, aiError } = await parseMeetingNotes(notes, defaultCompany || undefined);
      setTasks(parsed.map((p, i) => taskFromParsed(p, i)));
      if (parsed.length === 0) setError("No action items detected. Try bullet points like 'Amina to send invoice by Friday'.");
      if (source === "rules-no-key") setParseInfo("AI extraction is off, so I used the basic extractor.");
      else if (source === "rules-ai-error") setParseInfo(`AI extraction failed (${aiError || "unknown error"}), so I used the basic extractor.`);
      else if (source === "rules-empty-ai") setParseInfo("AI returned no items, so I tried the basic extractor.");
    });
  }

  function updateTask(id: string, patch: Partial<EditableTask>) {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  function addBlank() {
    const id = `t-manual-${Date.now()}`;
    setTasks(prev => [...prev, {
      id,
      checked: true,
      meetingId,
      companyId: defaultCompany || companies[0]?.id || 0,
      actionItem: "",
      priority: "Low",
      status: "Not Started",
      deadline: null,
      deadlineLabel: null,
      assigneeNames: [],
      category: null,
      escalation: "No",
    }]);
    setExpandedId(id);
  }

  function handleSave() {
    const toSave = tasks
      .filter(t => t.checked && t.actionItem.trim() && t.companyId)
      .map(t => ({ ...t, meetingId }));
    if (!toSave.length) {
      setError("Select at least one task with a company and action item.");
      return;
    }
    setError(null);
    startSave(async () => {
      const { created, failures } = await bulkCreateTasks(toSave);
      setSavedCount(created);
      setSaveFailures(failures.map(f => ({ actionItem: f.actionItem, reason: f.reason })));
      if (failures.length === 0) {
        setTasks([]);
      } else {
        const failedKeys = new Set(failures.map(f => f.actionItem));
        setTasks(prev => prev.filter(t => failedKeys.has(t.actionItem)));
      }
      if (meetingId) {
        const fresh = await listMeetings();
        setMeetingList(fresh);
        const current = fresh.find(m => m.id === meetingId);
        setCreatedTaskLinks(current?.tasks ?? []);
        router.refresh();
        setMeetingNotice("Tasks created and linked to this meeting.");
      }
      router.refresh();
    });
  }

  const checkedCount = tasks.filter(t => t.checked).length;
  const allChecked = tasks.length > 0 && tasks.every(t => t.checked);
  const needsReview = tasks.filter(t => t.checked && (!t.companyId || !t.actionItem.trim())).length;
  const summary = {
    companies: new Set(tasks.filter(t => t.companyId).map(t => t.companyId)).size,
    deadlines: tasks.filter(t => t.deadline).length,
    critical: tasks.filter(t => t.priority === "Critical").length,
  };

  function toggleAll() {
    const next = !allChecked;
    setTasks(prev => prev.map(t => ({ ...t, checked: next })));
  }

  const filteredMeetings = meetingList.filter(m => {
    const q = historyQuery.trim().toLowerCase();
    const matchesCompany = !historyCompany || m.companyId === historyCompany;
    const haystack = `${m.title} ${m.companyName ?? ""} ${m.attendees ?? ""} ${m.rawNotes} ${m.minutes ?? ""}`.toLowerCase();
    return matchesCompany && (!q || haystack.includes(q));
  });
  const historyStats = {
    total: meetingList.length,
    withMinutes: meetingList.filter(m => !!m.minutes).length,
    withTasks: meetingList.filter(m => m.taskCount > 0).length,
  };
  const selectedMeeting = meetingId ? meetingList.find(m => m.id === meetingId) : null;

  return (
    <div className="space-y-3 sm:space-y-5">
      <div className="grid gap-3 lg:gap-4 lg:grid-cols-[1fr_280px]">
        <section className="space-y-3 sm:space-y-4">
          <div className="rounded-xl sm:rounded-2xl border border-border bg-bg-elev p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-fg-subtle">Current meeting</p>
                <h2 className="text-sm font-semibold">{meetingId ? title : "New meeting"}</h2>
              </div>
              <button type="button" onClick={startNewMeeting} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors">
                <Plus size={12} /> New
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <label className="space-y-1 col-span-2 sm:col-span-1">
                <span className={labelCls}>Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} className={fieldCls} />
              </label>
              <label className="space-y-1">
                <span className={labelCls}>Date</span>
                <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className={fieldCls} />
              </label>
              <label className="space-y-1 col-span-2 sm:col-span-1">
                <span className={labelCls}>Meeting company</span>
                <select value={defaultCompany} onChange={e => setDefaultCompany(Number(e.target.value))} className={fieldCls}>
                  <option value={0}>Group-wide / auto-detect</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 col-span-2 sm:col-span-1">
                <span className={labelCls}>Attendees</span>
                <input value={attendees} onChange={e => setAttendees(e.target.value)} placeholder="Comma-separated names" className={fieldCls} />
              </label>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <button type="button" onClick={handleSaveMeeting} disabled={isSavingMeeting} className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg disabled:opacity-50">
                {isSavingMeeting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {isSavingMeeting ? "Saving..." : "Save meeting"}
              </button>
              <button type="button" onClick={handleGenerateMinutes} disabled={isGeneratingMinutes || !notes.trim()} className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-fg-muted hover:text-fg disabled:opacity-50">
                {isGeneratingMinutes ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                {isGeneratingMinutes ? "Generating..." : "Minutes"}
              </button>
              <button type="button" onClick={handleCleanNotes} disabled={isCleaningNotes || !notes.trim()} className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-fg-muted hover:text-fg disabled:opacity-50">
                {isCleaningNotes ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {isCleaningNotes ? "Cleaning..." : "Clean"}
              </button>
              <button type="button" onClick={handleExtract} disabled={!notes.trim() || isParsing} className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-fg-muted hover:text-fg disabled:opacity-50">
                {isParsing ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                {isParsing ? "Extracting..." : "Actions"}
              </button>
              {meetingNotice && <span className="col-span-2 text-xs text-success">{meetingNotice}</span>}
            </div>

            {selectedMeeting && (
              <div className="rounded-xl border border-border bg-bg-subtle px-3 py-2 text-xs text-fg-muted flex flex-wrap gap-x-3 gap-y-1">
                <span>Saved meeting</span>
                <span>{selectedMeeting.companyName || "Group-wide"}</span>
                <span>{selectedMeeting.meetingDate}</span>
                {selectedMeeting.minutes && <span className="text-success">Minutes saved</span>}
                {selectedMeeting.taskCount > 0 && <span>{selectedMeeting.taskCount} linked task{selectedMeeting.taskCount === 1 ? "" : "s"}</span>}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-fg-muted px-1">
              Raw notes
              <span className="hidden sm:inline font-normal text-fg-subtle ml-1">- type, paste, or dictate during the meeting</span>
            </label>
            <PromptBox
              value={notes}
              onChange={updateNotes}
              onSubmit={handleExtract}
              disabled={isParsing}
              submitOnEnter={false}
              minHeight={120}
              maxHeight={260}
              placeholder={`Dar Spices meeting - ${meetingDate}\n\n- Review packaging supplier contract by end of month\n- Shivam to follow up on payment invoice urgent\n- Schedule quality inspection next week`}
              hint={<span className="text-fg-subtle">Saved notes can become minutes and tasks.</span>}
              actions={
                <>
                  <VoiceButton disabled={isParsing || isPolishingVoice} onResult={appendNotes} onStop={handleVoiceStop} lang={voiceLanguage} title="Dictate notes" />
                  <button onClick={handleExtract} disabled={!notes.trim() || isParsing} className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-accent text-accent-fg text-xs font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
                    {isParsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {isParsing ? "Extracting..." : "Actions"}
                  </button>
                </>
              }
            />
            {(voiceInfo || lastRawVoice) && (
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-fg-muted">
                {isPolishingVoice && <Loader2 size={12} className="animate-spin" />}
                {voiceInfo && <span>{voiceInfo}</span>}
                {lastRawVoice && (
                  <button type="button" onClick={() => updateNotes(lastRawVoice)} className="text-accent hover:underline">
                    Use raw
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2 px-1">
              <input
                value={voiceTerm}
                onChange={e => setVoiceTerm(e.target.value)}
                placeholder="Teach COS a name or phrase"
                className="min-w-0 flex-1 rounded-lg border border-border bg-bg-subtle px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent"
              />
              <button type="button" onClick={handleTeachVoice} disabled={isTeachingVoice || !voiceTerm.trim()} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50">
                {isTeachingVoice ? "Saving..." : "Teach"}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-fg-muted px-1">
              Meeting minutes
              <span className="font-normal text-fg-subtle ml-1">- AI-assisted, editable before saving</span>
            </label>
            <textarea
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
              placeholder="Generate minutes from the notes, or write them manually..."
              className="w-full min-h-[130px] sm:min-h-[180px] rounded-xl sm:rounded-2xl border border-border bg-bg-elev p-3 sm:p-4 text-sm leading-relaxed focus:outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleInsight("decisions")} disabled={isGeneratingInsight || (!notes.trim() && !minutes.trim())} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50">
                {isGeneratingInsight ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Extract decisions
              </button>
              <button type="button" onClick={() => handleInsight("risks")} disabled={isGeneratingInsight || (!notes.trim() && !minutes.trim())} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50">
                {isGeneratingInsight ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Extract risks
              </button>
              <button type="button" onClick={() => handleInsight("follow-up")} disabled={isGeneratingInsight || (!notes.trim() && !minutes.trim())} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50">
                {isGeneratingInsight ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Draft follow-up
              </button>
            </div>
            {minutesInfo && <p className="text-xs text-fg-muted px-1">{minutesInfo}</p>}
          </div>

          {insight && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-fg-muted px-1">Meeting intelligence</label>
              <textarea
                value={insight}
                onChange={e => setInsight(e.target.value)}
                className="w-full min-h-[140px] rounded-2xl border border-border bg-bg-elev p-4 text-sm leading-relaxed focus:outline-none focus:border-accent"
              />
            </div>
          )}
        </section>

        <aside className="space-y-2 lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
            <span className="inline-flex items-center gap-2">
            <History size={13} /> Meeting history
            </span>
            <span className="lg:hidden normal-case tracking-normal text-fg-subtle">{filteredMeetings.length} shown</span>
          </div>
          <div className="rounded-xl sm:rounded-2xl border border-border bg-bg-elev p-2.5 sm:p-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-subtle px-2.5 py-1.5">
              <Search size={13} className="text-fg-subtle shrink-0" />
              <input
                value={historyQuery}
                onChange={e => setHistoryQuery(e.target.value)}
                placeholder="Search notes, minutes, attendees..."
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs shadow-none focus:!shadow-none focus:!ring-0"
              />
            </div>
            <select value={historyCompany} onChange={e => setHistoryCompany(Number(e.target.value))} className="w-full rounded-lg border border-border bg-bg-subtle px-2.5 py-1.5 text-xs">
              <option value={0}>All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-fg-muted">
              <span className="rounded-full bg-bg-muted px-2 py-0.5">{historyStats.total} saved</span>
              <span className="rounded-full bg-bg-muted px-2 py-0.5">{historyStats.withMinutes} with minutes</span>
              <span className="rounded-full bg-bg-muted px-2 py-0.5">{historyStats.withTasks} with tasks</span>
            </div>
          </div>
          <div className="max-h-64 lg:max-h-[520px] overflow-y-auto space-y-2 pr-1">
            {meetingList.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-fg-muted">No saved meetings yet.</div>
            )}
            {meetingList.length > 0 && filteredMeetings.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-fg-muted">No meetings match that search.</div>
            )}
            {filteredMeetings.map(m => (
              <button key={m.id} type="button" onClick={() => loadMeeting(m)} className={`w-full rounded-xl border p-3 text-left transition-colors ${meetingId === m.id ? "border-accent bg-accent/5" : "border-border bg-bg-elev hover:border-accent/50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.title}</p>
                    <p className="text-xs text-fg-muted">{m.companyName || "Group-wide"} - {m.meetingDate}</p>
                  </div>
                  {m.taskCount > 0 && <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px] text-fg-muted">{m.taskCount} tasks</span>}
                </div>
                {m.minutes && <p className="mt-2 text-[11px] text-success">Minutes saved</p>}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {savedCount !== null && (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-success text-sm font-medium">
          <CheckCircle2 size={16} />
          {savedCount} task{savedCount !== 1 ? "s" : ""} created successfully and added to the registry.
        </div>
      )}

      {error && <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-4 py-3">{error}</p>}
      {parseInfo && <p className="text-xs text-warn bg-warn/5 border border-warn/20 rounded-lg px-4 py-2">{parseInfo}</p>}

      {saveFailures.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
          <p className="font-medium text-danger mb-1.5">{saveFailures.length} task{saveFailures.length !== 1 ? "s" : ""} failed to save</p>
          <ul className="space-y-1 text-xs text-fg-muted">
            {saveFailures.map((f, i) => (
              <li key={i}><span className="text-fg">{f.actionItem || "(empty)"}</span> - {f.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {(createdTaskLinks.length > 0 || (meetingId && meetingList.find(m => m.id === meetingId)?.tasks.length)) && (
        <div className="rounded-2xl border border-border bg-bg-elev p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">Tasks from this meeting</h2>
            <span className="text-[11px] text-fg-subtle">{(createdTaskLinks.length ? createdTaskLinks : meetingList.find(m => m.id === meetingId)?.tasks ?? []).length} linked</span>
          </div>
          <div className="grid gap-2">
            {(createdTaskLinks.length ? createdTaskLinks : meetingList.find(m => m.id === meetingId)?.tasks ?? []).map(task => (
              <Link
                key={task.id}
                href={`/task/${task.code}`}
                className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-bg-subtle px-3 py-2.5 hover:border-accent/50 transition-colors"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs text-accent">{task.code}</span>
                  <p className="truncate text-sm text-fg group-hover:text-accent">{task.actionItem}</p>
                </div>
                <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] text-fg-muted">{task.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-3 pb-16">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted">
                Extracted Tasks - {checkedCount} of {tasks.length}
              </h2>
              {needsReview > 0 && <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] text-warn">{needsReview} need review</span>}
              <button onClick={toggleAll} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors">
                {allChecked ? <CheckSquare size={13} /> : <Square size={13} />}
                {allChecked ? "Deselect all" : "Select all"}
              </button>
            </div>
            <button onClick={addBlank} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg border border-border rounded-lg px-3 py-1.5 transition-colors">
              <Plus size={12} /> Add manually
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted">{summary.companies} compan{summary.companies === 1 ? "y" : "ies"}</span>
            <span className="rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted">{summary.deadlines} deadline{summary.deadlines === 1 ? "" : "s"}</span>
            {summary.critical > 0 && <span className="rounded-full bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-0.5">{summary.critical} critical</span>}
          </div>

          <div className="space-y-2">
            {tasks.map(task => {
              const isExpanded = expandedId === task.id;
              const hasIssue = !task.companyId || !task.actionItem.trim();
              const stripe = task.priority === "Critical" ? "bg-danger" : task.priority === "High" ? "bg-warn" : task.priority === "Medium" ? "bg-accent" : "bg-border";
              return (
                <div key={task.id} className={`relative overflow-hidden card border transition-colors ${!task.checked ? "opacity-50" : ""} ${hasIssue ? "border-warn/40" : ""}`}>
                  <span className={`absolute left-0 top-0 bottom-0 w-1 ${stripe}`} />
                  <div className="flex items-center gap-3 p-3 pl-4">
                    <input type="checkbox" checked={task.checked} onChange={e => updateTask(task.id, { checked: e.target.checked })} className="accent-[var(--accent)] w-4 h-4 shrink-0" />
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
                        placeholder="Action item..."
                        className="w-full bg-transparent text-sm focus:outline-none placeholder:text-fg-muted"
                      />
                      <div className="flex flex-wrap gap-2 mt-1">
                        {task.companyId ? <span className="text-xs text-fg-muted">{companies.find(c => c.id === task.companyId)?.name}</span> : <span className="text-xs text-warn">No company</span>}
                        {task.assigneeNames.length > 0 && <span className="text-xs text-fg-muted">To {task.assigneeNames.join(", ")}</span>}
                        {task.deadline && <span className="text-xs text-fg-muted">Due {task.deadlineLabel || task.deadline}</span>}
                        {task.priority !== "Low" && <span className={`text-xs font-medium ${task.priority === "Critical" || task.priority === "High" ? "text-warn" : "text-fg-muted"}`}>{task.priority}</span>}
                        {task.category && <span className="text-xs text-fg-muted">{task.category}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setExpandedId(isExpanded ? null : task.id)} className="p-1.5 rounded text-fg-muted hover:text-fg transition-colors" title="Edit details">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button onClick={() => removeTask(task.id)} className="p-1.5 rounded text-fg-muted hover:text-danger transition-colors" title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div key="expand" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="overflow-hidden">
                        <div className="border-t border-border px-4 pb-4 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="space-y-1 col-span-2 sm:col-span-3">
                            <label className={labelCls}>Company *</label>
                            <select value={task.companyId} onChange={e => updateTask(task.id, { companyId: Number(e.target.value) })} className={fieldCls}>
                              <option value={0}>Select company...</option>
                              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className={labelCls}>Priority</label>
                            <select value={task.priority} onChange={e => updateTask(task.id, { priority: e.target.value })} className={fieldCls}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select>
                          </div>
                          <div className="space-y-1">
                            <label className={labelCls}>Status</label>
                            <select value={task.status} onChange={e => updateTask(task.id, { status: e.target.value })} className={fieldCls}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
                          </div>
                          <div className="space-y-1">
                            <label className={labelCls}>Deadline</label>
                            <input type="date" value={task.deadline || ""} onChange={e => updateTask(task.id, { deadline: e.target.value || null, deadlineLabel: null })} className={fieldCls} />
                          </div>
                          <div className="space-y-1">
                            <label className={labelCls}>Category</label>
                            <select value={task.category || ""} onChange={e => updateTask(task.id, { category: e.target.value || null })} className={fieldCls}>
                              <option value="">None</option>
                              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className={labelCls}>Assigned to</label>
                            <input type="text" value={task.assigneeNames.join(", ")} onChange={e => updateTask(task.id, { assigneeNames: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} placeholder="comma-separated names" className={fieldCls} />
                          </div>
                          <div className="space-y-1">
                            <label className={labelCls}>Escalation</label>
                            <select value={task.escalation} onChange={e => updateTask(task.id, { escalation: e.target.value })} className={fieldCls}>
                              <option>No</option>
                              <option>Yes</option>
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

          <div className="sticky bottom-20 z-30 flex justify-end pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-3 vibrancy-strong rounded-full shadow-pill border border-border pl-4 pr-2 py-1.5">
              <span className="text-xs text-fg-muted">{checkedCount} task{checkedCount !== 1 ? "s" : ""} to create{needsReview ? ` - ${needsReview} need review` : ""}</span>
              <button onClick={handleSave} disabled={!checkedCount || isSaving} className="flex items-center gap-2 px-4 h-9 rounded-full bg-accent text-accent-fg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {isSaving ? "Creating..." : `Create ${checkedCount} Task${checkedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
