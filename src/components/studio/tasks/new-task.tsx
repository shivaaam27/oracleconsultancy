"use client";

/**
 * Creating a task in Studio (mockup boards QuickAdd + NewTask, approved
 * 24 Sept 2026). Two depths, ONE draft and ONE writer:
 *  - `QuickTaskPane` — the Task tab of the footer's "+ New" card: what, company,
 *    who, when, priority, repeat, instructions. Enter creates.
 *  - `StudioNewTaskPage` — "Open as a full task": the record page itself as an
 *    unsaved draft, so adding and editing are one screen.
 * Both send the same `Draft` to `createTaskStudio` (→ createTaskCore).
 */
import { PersonFace } from "@/components/studio/face";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Loader2, Paperclip, Repeat, UserPlus, X } from "lucide-react";
import { createTaskStudio, adminAddUpdate, adminRemindTask, type StudioNewTask } from "@/app/task/actions";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { DatePopover } from "@/components/date-popover";
import { Combobox } from "@/components/combobox";
import { StudioPeoplePick } from "@/components/studio/people-pick";
import { DraftSubtasks } from "@/components/studio/subtasks";
import { addSubtasks } from "@/app/task/subtask-actions";
import { StudioScope, stBtn } from "@/components/studio/kit";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { StudioChoiceMenu } from "./cells";
import { STATUS_DOT, avatarTint, initials } from "./task-words";
import { RISKS, CATEGORIES } from "@/lib/constants";
import { withReturn } from "@/lib/return-to";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------ the draft -- */

export type RepeatDraft = { cadence: "weekly" | "monthly"; weekdays: number[]; dayOfMonth: number; alsoToday: boolean };
export type Draft = {
  title: string;
  /** Subtasks typed before the task exists — saved straight after it is made. */
  subtasks?: string[];
  companyId: number | null;
  people: string[];
  status: string;
  priority: string;
  deadline: string | null;
  meetingDate: string | null;
  risk: string | null;
  category: string | null;
  department: string | null;
  about: string;
  lead: boolean;
  needsFile: boolean;
  repeat: RepeatDraft | null;
  instructions: string;
  pin: boolean;
  also: number[];
  tell: boolean;
};

export type Options = { companies: { id: number; name: string; prefix?: string | null }[]; people: { id: number; name: string }[]; departments: string[] };

export const EMPTY_DRAFT: Draft = {
  title: "", companyId: null, people: [], status: "Not Started", priority: "Medium", deadline: null, meetingDate: null,
  risk: null, category: null, department: null, about: "", lead: false, needsFile: false, repeat: null,
  instructions: "", pin: false, also: [], tell: false,
};

const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_DOT: Record<string, string> = { Critical: "#E0479E", High: "#F5A524", Medium: "#2490EF", Low: "#B9BBBF" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toInput(d: Draft): StudioNewTask {
  return {
    companyId: d.companyId ?? 0,
    actionItem: d.title,
    assigneeNames: d.people,
    status: d.status,
    priority: d.priority,
    risk: d.risk,
    category: d.category,
    departmentName: d.department,
    deadline: d.deadline,
    meetingDate: d.meetingDate,
    comments: d.about || null,
    requiresAttachment: d.needsFile,
    accountability: d.lead ? "lead" : "shared",
    repeat: d.repeat,
    instructions: d.instructions || null,
    pinInstructions: d.pin,
    alsoCompanyIds: d.also,
  };
}

/** The address of the full page for this draft — Shift+Enter / "Open as a full task". */
export function fullTaskHref(d: Draft): string {
  const p = new URLSearchParams();
  if (d.title.trim()) p.set("title", d.title.trim());
  if (d.companyId) p.set("companyId", String(d.companyId));
  if (d.people.length) p.set("assignees", d.people.join(","));
  if (d.deadline) p.set("deadline", d.deadline);
  if (d.priority !== "Medium") p.set("priority", d.priority);
  if (d.instructions.trim()) p.set("instructions", d.instructions.trim());
  if (typeof window !== "undefined") p.set("returnTo", `${location.pathname}${location.search}`);
  const q = p.toString();
  return `/task/new${q ? `?${q}` : ""}`;
}

export function repeatWords(r: RepeatDraft | null): string {
  if (!r) return "Doesn’t repeat";
  if (r.cadence === "monthly") return `Monthly on the ${ordinal(r.dayOfMonth)}`;
  const d = [...r.weekdays].sort();
  if (d.join() === "1,2,3,4,5") return "Every weekday";
  return `Weekly · ${d.map((i) => WEEKDAYS[i]).join(", ")}`;
}
function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

/** Create, and do the "after" things the draft asked for. One place, used by both screens. */
export function useCreateTask() {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  function create(d: Draft, file: File | null, after: (r: { code: string; taskId: number } | "rule") => void) {
    if (!d.title.trim()) { toast("Say what needs doing first.", { tone: "warn" }); return; }
    if (!d.companyId) { toast("Pick a company — it sets the task code.", { tone: "warn" }); return; }
    start(async () => {
      // A dropped connection throws — inside this transition that would take
      // the page (and everything typed) down to the error screen.
      const res = await createTaskStudio(toInput(d)).catch(() => ({ ok: false as const, error: "That didn't go through — check the connection and try again. What you typed is still here." }));
      if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
      if (res.ruleOnly) {
        toast("Saved as a repeating task — the first one appears on its day.", { tone: "success", duration: 6000 });
        after("rule");
        return;
      }
      if (d.subtasks?.length) {
        try { await addSubtasks(res.taskId, d.subtasks); } catch { toast("The task was created, but its subtasks didn't save — add them from the task.", { tone: "warn" }); }
      }
      if (file) {
        const fd = new FormData();
        fd.set("taskId", String(res.taskId));
        fd.set("code", res.code);
        fd.set("body", "");
        fd.set("attachment", file);
        try { await adminAddUpdate(fd); } catch { toast("The task was created, but the file didn't attach — add it from the task.", { tone: "warn" }); }
      }
      let link: string | undefined;
      if (d.tell && d.people.length) {
        const r = await adminRemindTask(res.taskId, false).catch(() => ({ ok: false as const, error: "" }));
        if (r.ok) link = r.link ?? undefined;
      }
      const also = res.copies.length ? ` — and ${res.copies.join(", ")}` : "";
      toast(`${res.code} created${also}.`, {
        tone: "success",
        duration: 7000,
        action: link
          ? { label: "Send the message", onClick: () => { window.open(link!, "_blank"); } }
          : res.undoToken
            ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } }
            : undefined,
      });
      after({ code: res.code, taskId: res.taskId });
    });
  }
  return { create, busy };
}

/* ------------------------------------------------------- small controls -- */

const CHIP = "h-8 rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-2.5 py-0 text-xs mx-0 hover:bg-[var(--st-page)]";

export function RepeatPicker({ value, onChange, anchorDate }: { value: RepeatDraft | null; onChange: (r: RepeatDraft | null) => void; anchorDate?: string | null }) {
  const base = anchorDate ? new Date(`${anchorDate}T12:00:00`) : new Date();
  const wd = base.getDay();
  const dom = base.getDate();
  const r = value;
  return (
    <div className="space-y-2.5">
      <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px] text-xs">
        {([["none", "Doesn’t repeat"], ["weekly", "Weekly"], ["monthly", "Monthly"]] as const).map(([k, l]) => {
          const on = k === "none" ? !r : r?.cadence === k;
          return (
            <button key={k} type="button" aria-pressed={on}
              onClick={() => onChange(k === "none" ? null : k === "weekly" ? { cadence: "weekly", weekdays: r?.cadence === "weekly" ? r.weekdays : [wd], dayOfMonth: dom, alsoToday: false } : { cadence: "monthly", weekdays: [], dayOfMonth: r?.cadence === "monthly" ? r.dayOfMonth : dom, alsoToday: false })}
              className={cn("h-7 flex-1 rounded-lg px-2", on ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)]")}
            >{l}</button>
          );
        })}
      </div>
      {r?.cadence === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((w, i) => {
            const on = r.weekdays.includes(i);
            return (
              <button key={w} type="button" aria-pressed={on}
                onClick={() => onChange({ ...r, weekdays: on ? r.weekdays.filter((x) => x !== i) : [...r.weekdays, i] })}
                className={cn("h-8 w-10 rounded-lg border text-xs", on ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-page)]" : "border-[var(--st-line)]")}
              >{w}</button>
            );
          })}
        </div>
      )}
      {r?.cadence === "monthly" && (
        <label className="flex items-center gap-2 text-xs text-[var(--st-sub)]">
          On day
          <input type="number" min={1} max={31} value={r.dayOfMonth}
            onChange={(e) => onChange({ ...r, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
            className="h-8 w-16 rounded-lg px-2 text-[13px]" />
          of every month
        </label>
      )}
      {r && (
        <label className="flex items-center gap-2 text-xs text-[var(--st-sub)]">
          <Toggle on={r.alsoToday} onClick={() => onChange({ ...r, alsoToday: !r.alsoToday })} />
          Create one for today as well
        </label>
      )}
    </div>
  );
}

export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={cn("relative h-5 w-[34px] shrink-0 rounded-full transition-colors", on ? "bg-[var(--st-ink)]" : "bg-[#D6D6D2]")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left]", on ? "left-4" : "left-0.5")} />
    </button>
  );
}

/* ------------------------------------------------ the "+ New" task tab -- */

/* The card follows the theme like every sheet that opens from the footer (the
   Go-to panel, search, notifications): its colours are the `--sh-*` set on
   `.st-sheet`, which also re-points Desk's tokens, so the people picker and the
   calendar inside it follow the same light or dark. */
const DCHIP = "mx-0 py-0 h-8 rounded-[10px] border border-[var(--sh-field-line)] bg-[var(--sh-field)] px-2.5 text-xs text-[var(--sh-fg)] hover:bg-[var(--sh-hover)] hover:border-[var(--sh-field-line)]";

export function QuickTaskPane({ options, defaultCompanyId, onDone, registerSubmit }: {
  options: Options | null;
  defaultCompanyId: number | null;
  /** `again` = "Create and add another": the card stays open for the next one. */
  onDone: (again: boolean) => void;
  /** Lets the card's footer buttons submit this pane. */
  registerSubmit: (fn: (again: boolean) => void, busy: boolean, fullHref: () => string) => void;
}) {
  const [d, setD] = useState<Draft>({ ...EMPTY_DRAFT, companyId: defaultCompanyId });
  const [who, setWho] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const title = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { create, busy } = useCreateTask();
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => { if (defaultCompanyId && !d.companyId) set({ companyId: defaultCompanyId }); }, [defaultCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(again: boolean) {
    create(d, null, () => {
      try { if (d.companyId) localStorage.setItem("studio.newTask.company", String(d.companyId)); } catch { /* fine */ }
      router.refresh();
      if (again) {
        // Same company, people and priority — only the task itself is new.
        setD((x) => ({ ...EMPTY_DRAFT, companyId: x.companyId, people: x.people, priority: x.priority }));
        setWho(false);
        title.current?.focus();
      }
      onDone(again);
    });
  }
  const full = () => fullTaskHref(d);
  useEffect(() => { registerSubmit(submit, busy, full); }); // eslint-disable-line react-hooks/exhaustive-deps

  const companies = options?.companies ?? [];
  const company = companies.find((c) => c.id === d.companyId);
  const base = d.deadline ? new Date(`${d.deadline}T12:00:00`) : new Date();
  return (
    <div className="flex flex-col gap-3.5">
      <input
        ref={title}
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); router.push(full()); onDone(false); }
          else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(true); }
          else if (e.key === "Enter") { e.preventDefault(); submit(false); }
        }}
        placeholder="What needs doing?"
        aria-label="What needs doing?"
        /* Inline: the unlayered `input` rule in globals.css beats utilities. */
        style={{ color: "var(--sh-fg)", background: "transparent", border: 0, boxShadow: "none" }}
        className="bare-field w-full px-0 py-1 text-[26px] tracking-[-0.02em] outline-none placeholder:text-[var(--sh-muted)]"
      />
      <div className="flex flex-wrap gap-1.5">
        <StudioChoiceMenu
          value={d.companyId ? String(d.companyId) : null}
          options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          onPick={(v) => set({ companyId: Number(v), also: d.also.filter((x) => x !== Number(v)) })}
          prefix="Company" empty="pick one" showDot={false} width={260}
          className={cn(DCHIP, "st-dark-chip", !company && "border-[var(--sh-muted)]")}
        />
        <button type="button" onClick={() => setWho((v) => !v)} aria-expanded={who} className={cn(DCHIP, "inline-flex items-center gap-1.5")}>
          <span className="text-[var(--sh-sub)]">Who</span>
          {d.people.length ? <span className="max-w-[12rem] truncate font-medium">{d.people.join(", ")}</span> : <span className="text-[var(--sh-muted)]">nobody yet</span>}
        </button>
        <DatePopover
          value={d.deadline}
          label={d.deadline ? null : "When"}
          onChange={(v) => set({ deadline: v || null })}
          compact
          triggerClassName={cn(DCHIP, "st-dark-chip inline-flex items-center gap-1.5")}
        />
        <StudioChoiceMenu value={d.priority} options={PRIORITIES.map((p) => ({ value: p, label: p, dot: PRIORITY_DOT[p] }))} onPick={(v) => set({ priority: v })} prefix="Priority" showDot={false} className={cn(DCHIP, "st-dark-chip")} width={180} />
        <StudioChoiceMenu
          value={d.repeat ? (d.repeat.cadence === "monthly" ? "m" : d.repeat.weekdays.join() === "1,2,3,4,5" ? "wd" : "w") : "no"}
          options={[
            { value: "no", label: "No" },
            { value: "wd", label: "Every weekday" },
            { value: "w", label: `Weekly on ${WEEKDAYS[base.getDay()]}` },
            { value: "m", label: `Monthly on the ${ordinal(base.getDate())}` },
          ]}
          onPick={(v) => {
            set({ repeat: v === "no" ? null : v === "m" ? { cadence: "monthly", weekdays: [], dayOfMonth: base.getDate(), alsoToday: false } : { cadence: "weekly", weekdays: v === "wd" ? [1, 2, 3, 4, 5] : [base.getDay()], dayOfMonth: 1, alsoToday: false } });
          }}
          prefix="Repeat" showDot={false} className={cn(DCHIP, "st-dark-chip")} width={220}
        />
      </div>
      {who && (
        <div className="flex flex-col gap-2.5 rounded-[16px] border border-[var(--sh-chip-line)] bg-[var(--sh-card)] p-3">
          <StudioPeoplePick tone="sheet" autoFocus people={options?.people ?? []} value={d.people} onChange={(people) => set({ people })} maxHeight={196} />
          <div className="flex justify-end"><button type="button" onClick={() => setWho(false)} className={cn(DCHIP, "px-3.5 font-medium")}>Done</button></div>
        </div>
      )}
      <textarea
        value={d.instructions}
        onChange={(e) => set({ instructions: e.target.value })}
        rows={2}
        placeholder="Instructions for the team — they arrive as the first update (optional)"
        style={{ color: "var(--sh-fg)", background: "var(--sh-field)", border: "1px solid var(--sh-field-line)", boxShadow: "none" }}
        className="bare-field w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none placeholder:text-[var(--sh-muted)]"
      />
    </div>
  );
}

/* ----------------------------------------------- the full new task page -- */

export function StudioNewTaskPage({ options, initial, back }: { options: Options; initial: Partial<Draft>; back: string }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>({ ...EMPTY_DRAFT, ...initial });
  const [file, setFile] = useState<File | null>(null);
  const [tab, setTab] = useState<"instructions" | "subtasks" | "attachments">("instructions");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useFitFrame(gridRef);
  const { create, busy } = useCreateTask();
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  // Remember the company you last used when nothing chose one.
  useEffect(() => {
    if (d.companyId) return;
    try { const c = Number(localStorage.getItem("studio.newTask.company")); if (options.companies.some((x) => x.id === c)) set({ companyId: c }); } catch { /* fine */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const company = options.companies.find((c) => c.id === d.companyId);
  // The REAL prefix from the companies table — names were renamed and the
  // prefixes kept (Furaha Innovation is CC), so never guess it from the name.
  const prefix = company?.prefix ?? null;
  const dirty = !!(d.title.trim() || d.instructions.trim() || d.about.trim());

  function go(again: boolean) {
    create(d, file, (r) => {
      try { if (d.companyId) localStorage.setItem("studio.newTask.company", String(d.companyId)); } catch { /* fine */ }
      if (r === "rule") { router.push("/task/recurring?saved=1"); return; }
      if (again) { setD((x) => ({ ...EMPTY_DRAFT, companyId: x.companyId, people: x.people, priority: x.priority })); setFile(null); setPickerKey((k) => k + 1); return; }
      router.push(withReturn(`/task/${r.code}`, back));
    });
  }
  function discard() {
    if (dirty && !window.confirm("Discard this new task? What you typed will be lost.")) return;
    router.push(back);
  }

  const panel = "rounded-[18px] bg-[var(--st-surface)] p-5";
  const row = (label: string, value: ReactNode, need = false, hint?: string) => (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2.5 border-b border-[var(--st-line-soft)] py-2.5 last:border-b-0 xl:grid-cols-[100px_minmax(0,1fr)] xl:gap-3">
      <span className="text-[13px] text-[var(--st-muted)]">{label}{need && <span className="ml-0.5 text-[var(--st-late)]">*</span>}</span>
      <div className="min-w-0 text-[13px]">{value}{hint && <div className="text-[11px] text-[var(--st-muted)]">{hint}</div>}</div>
    </div>
  );
  const dateTrigger = "-mx-1.5 inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[13px] transition-colors hover:bg-[var(--st-page)]";
  const bandChip = "st-dark-chip h-7 rounded-lg bg-[#1F2023] px-2.5 text-xs text-[#F2F2F0] hover:bg-[#2A2C30]";

  return (
    <StudioScope className="space-y-4">
      {/* The band — the same as a task's, with Create where Complete would be. */}
      <div className="st-tex-rings flex flex-col gap-3 rounded-[20px] bg-[var(--st-card)] px-5 py-4 text-[var(--st-on-card)]">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={discard} className={cn(stBtn.onCard, "h-8")}><ChevronLeft size={13} /><span className="sm:hidden">Cancel</span><span className="hidden sm:inline">Back to the list</span></button>
          <span className="st-mono rounded-md bg-[var(--st-card-3)] px-2 py-1 text-[11px] text-[#C9CBCF]">NEW</span>
          <span className="hidden truncate text-[13px] text-[var(--st-on-card-muted)] sm:inline">Not saved yet — the code is given when you create it</span>
          <span className="grow" />
          {/* Phone (mockup M_NewTask): Save stays at the top, where the keyboard
              never covers it; "add another" and Discard follow below. */}
          <button type="button" onClick={discard} className={cn(stBtn.onCardGhost, "hidden sm:inline-flex")}>Discard</button>
          <button type="button" onClick={() => go(true)} disabled={busy} className={cn(stBtn.onCardGhost, "hidden sm:inline-flex")}>Create and add another</button>
          <button type="button" onClick={() => go(false)} disabled={busy} className={cn(stBtn.onCard, "h-9 sm:h-8")}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}<span className="sm:hidden">Save</span><span className="hidden sm:inline">Create task</span>
          </button>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <input
            autoFocus
            value={d.title}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(false); } }}
            placeholder="What needs doing?"
            aria-label="What needs doing?"
            /* Inline, because globals.css's unlayered `input { color; border }`
               beats any utility class — on the dark band it drew ink on ink. */
            style={{ color: "#F2F2F0", background: "transparent", border: 0, borderBottom: "1.5px solid #3A3D42", borderRadius: 0, boxShadow: "none" }}
            className="bare-field min-w-0 flex-1 basis-[420px] px-0 pb-1 text-[28px] font-medium tracking-[-0.03em] outline-none placeholder:text-[#5B5E63] sm:text-[36px]"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <StudioChoiceMenu value={d.status} options={STATUSES.map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] }))} onPick={(v) => set({ status: v })} tone="dark" />
            <DatePopover value={d.deadline} label={d.deadline ? null : "No deadline"} onChange={(v) => set({ deadline: v || null })} compact triggerClassName={cn(bandChip, "inline-flex items-center gap-1.5")} />
            <StudioChoiceMenu value={d.priority} options={PRIORITIES.map((p) => ({ value: p, label: p, dot: PRIORITY_DOT[p] }))} onPick={(v) => set({ priority: v })} tone="dark" suffix=" priority" showDot={false} />
            <button type="button" onClick={() => setRepeatOpen((v) => !v)} className={cn(bandChip, "inline-flex items-center gap-1.5")}><Repeat size={12} />{repeatWords(d.repeat)}</button>
          </div>
        </div>
        <div className="flex gap-2 sm:hidden">
          <button type="button" onClick={() => go(true)} disabled={busy} className={cn(stBtn.onCardGhost, "h-10 flex-1 justify-center")}>Save and add another</button>
          <button type="button" onClick={discard} className={cn(stBtn.onCardGhost, "h-10 justify-center")}>Discard</button>
        </div>
      </div>

      <div ref={gridRef} className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)_240px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_304px] 2xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        {/* Details — the same rows as a task's, set here before it exists. */}
        <div className={cn(panel, "st-scroll order-2 min-w-0 lg:order-1 lg:min-h-0 lg:overflow-y-auto")}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <div className="text-[15px] font-semibold">Details</div>
            <span className="text-[11px] text-[var(--st-muted)]">Click any value to set it</span>
          </div>
          {row("Company",
            <StudioChoiceMenu value={d.companyId ? String(d.companyId) : null} options={options.companies.map((c) => ({ value: String(c.id), label: c.name }))} onPick={(v) => set({ companyId: Number(v), also: d.also.filter((x) => x !== Number(v)) })} showDot={false} empty="Pick one" width={260} />,
            true, prefix ? `Sets the code: ${prefix}-…` : "Sets the task code")}
          {row("Accountable", <button type="button" onClick={() => setPeopleOpen(true)} className="-mx-1.5 block w-[calc(100%+12px)] truncate rounded-md px-1.5 py-0.5 text-left hover:bg-[var(--st-page)]">{d.people.length ? d.people.join(", ") : <span className="text-[var(--st-muted)]">Nobody yet</span>}</button>)}
          {row("Status", <StudioChoiceMenu value={d.status} options={STATUSES.map((s) => ({ value: s, label: s, dot: STATUS_DOT[s] }))} onPick={(v) => set({ status: v })} />)}
          {row("Priority", <StudioChoiceMenu value={d.priority} options={PRIORITIES.map((p) => ({ value: p, label: p, dot: PRIORITY_DOT[p] }))} onPick={(v) => set({ priority: v })} />)}
          {row("Deadline", <DatePopover value={d.deadline} label={d.deadline ? null : "Not set"} onChange={(v) => set({ deadline: v || null })} compact triggerClassName={dateTrigger} />)}
          {row("Meeting date", <DatePopover value={d.meetingDate} label={d.meetingDate ? null : "Not set"} onChange={(v) => set({ meetingDate: v || null })} compact triggerClassName={dateTrigger} />)}
          {row("Risk", <StudioChoiceMenu value={d.risk} options={[...RISKS.map((r) => ({ value: r, label: r, dot: PRIORITY_DOT[r] })), ...(d.risk ? [{ value: "", label: "Clear it", muted: true }] : [])]} onPick={(v) => set({ risk: v || null })} />)}
          {row("Department", <Combobox options={options.departments} defaultValue={d.department ?? ""} placeholder="Pick, or type a new one" onCommit={(v) => set({ department: v.trim() || null })} onInput={(v) => set({ department: v.trim() || null })} />)}
          {row("Category", <StudioChoiceMenu value={d.category} options={[...CATEGORIES.map((c) => ({ value: c, label: c })), ...(d.category ? [{ value: "", label: "Clear it", muted: true }] : [])]} onPick={(v) => set({ category: v || null })} showDot={false} />)}
          {row("About",
            <textarea value={d.about} onChange={(e) => set({ about: e.target.value })} rows={2} placeholder="What is this task about? (optional)"
              className="bare-field w-full resize-y rounded-lg border-0 bg-transparent px-0 py-0.5 text-[13px] outline-none placeholder:text-[var(--st-muted)]" />)}
          <div className="mb-1 mt-5 text-[15px] font-semibold">Rules</div>
          <RuleRow label="First person is the lead" hint="Only the lead has to finish it" on={d.lead} onClick={() => set({ lead: !d.lead })} />
          <RuleRow label="Needs a file to complete" hint="Staff can’t close it without attaching proof" on={d.needsFile} onClick={() => set({ needsFile: !d.needsFile })} />
        </div>

        {/* Instructions — the task's first update. */}
        <div className={cn(panel, "st-scroll order-1 flex min-w-0 flex-col px-5 pt-2 lg:order-2 lg:min-h-0 lg:overflow-y-auto")}>
          <div className="mb-3 flex shrink-0 gap-5 border-b border-[var(--st-line-soft)]" role="tablist">
            {([["instructions", "Instructions"], ["subtasks", d.subtasks?.length ? `Subtasks · ${d.subtasks.length}` : "Subtasks"], ["attachments", file ? "Attachment · 1" : "Attachment"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={cn("-mb-px inline-flex h-10 items-center border-b-2 text-[13px]", tab === k ? "border-[var(--st-ink)]" : "border-transparent text-[var(--st-muted)] hover:text-[var(--st-ink)]")}>{l}</button>
            ))}
          </div>
          {tab === "subtasks" ? (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 text-xs text-[var(--st-muted)]">The steps inside this task — a to-do list you tick off on the task itself.</p>
              <DraftSubtasks value={d.subtasks ?? []} onChange={(subtasks) => set({ subtasks })} title={false} />
            </div>
          ) : tab === "instructions" ? (
            <div className="flex flex-col gap-2.5 lg:flex-1">
              <p className="m-0 text-xs text-[var(--st-muted)]">Becomes the task’s first update — pin it as the current instruction if you like.</p>
              <textarea value={d.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="e.g. Call the TRA office, get the reference and the expected date, and attach the acknowledgement letter."
                className="bare-field min-h-[104px] w-full resize-y rounded-[14px] lg:min-h-[132px] border-0 bg-[var(--st-page)] px-4 py-3.5 text-[14px] leading-relaxed outline-none placeholder:text-[var(--st-muted)]" />
              <label className="flex items-center gap-2 text-xs text-[var(--st-sub)]">
                <Toggle on={d.pin} onClick={() => set({ pin: !d.pin })} label="Pin as the current instruction" />Pin as the current instruction
              </label>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#CFCFCA] text-[13px] text-[var(--st-sub)] hover:border-[var(--st-muted)]">
                <Paperclip size={18} />{file ? file.name : "Choose a file to attach — it goes on the first update"}
              </button>
              {file && <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="self-start text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Remove the file</button>}
            </div>
          )}
          <div className="h-4" />
        </div>

        {/* People · also create in · repeat */}
        <div className="st-scroll order-3 flex min-w-0 flex-col gap-3.5 rounded-[18px] lg:min-h-0 lg:overflow-y-auto">
          <div className={panel}>
            <div className="mb-3 text-[15px] font-semibold">People</div>
            {d.people.length > 0 && (
              <div className="mb-3 space-y-2">
                {d.people.map((n, i) => (
                  <div key={n} className="flex items-center gap-2.5">
                    <PersonFace name={n} size={32} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{n}</span><span className="block text-[11px] text-[var(--st-muted)]">{i === 0 ? (d.lead ? "The lead" : "Accountable") : "Also on it"}</span></span>
                    <button type="button" aria-label={`Take ${n} off`} onClick={() => { set({ people: d.people.filter((x) => x !== n) }); setPickerKey((k) => k + 1); }} className="text-[var(--st-muted)] hover:text-[var(--st-ink)]"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            {peopleOpen ? (
              <div className="space-y-2">
                <StudioPeoplePick autoFocus showChosen={false} people={options.people} value={d.people} onChange={(people) => set({ people })} />
                <button type="button" onClick={() => setPeopleOpen(false)} className="text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]">Done</button>
              </div>
            ) : (
              <button type="button" onClick={() => setPeopleOpen(true)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#CFCFCA] text-xs text-[var(--st-sub)] hover:border-[var(--st-muted)]"><UserPlus size={13} />Add someone</button>
            )}
            {d.people.length > 0 && (
              <label className="mt-3 flex items-center gap-2 text-xs text-[var(--st-sub)]">
                <Toggle on={d.tell} onClick={() => set({ tell: !d.tell })} label="Tell them now" />Tell them now (WhatsApp draft)
              </label>
            )}
          </div>

          <div className={panel}>
            <div className="text-[15px] font-semibold">Also create in</div>
            <p className="mb-2.5 mt-0.5 text-xs text-[var(--st-muted)]">A separate copy per company, each with its own code</p>
            <div className="st-scroll flex max-h-[220px] flex-col gap-1 overflow-y-auto">
              {options.companies.filter((c) => c.id !== d.companyId).map((c) => {
                const on = d.also.includes(c.id);
                return (
                  <button key={c.id} type="button" role="checkbox" aria-checked={on} onClick={() => set({ also: on ? d.also.filter((x) => x !== c.id) : [...d.also, c.id] })}
                    className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[13px] hover:bg-[var(--st-page)]">
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]", on ? "bg-[var(--st-ink)] text-white" : "border-[1.5px] border-[#CFCFCA]")}>{on && <Check size={11} strokeWidth={3} />}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={panel}>
            <div className="mb-2.5 text-[15px] font-semibold">Repeat</div>
            {repeatOpen || d.repeat ? (
              <RepeatPicker value={d.repeat} onChange={(r) => set({ repeat: r })} anchorDate={d.deadline} />
            ) : (
              <>
                <p className="text-[13px] text-[var(--st-muted)]">Doesn’t repeat</p>
                <button type="button" onClick={() => setRepeatOpen(true)} className={cn(stBtn.ghost, "mt-2.5 h-9 w-full justify-center text-xs")}><Repeat size={13} />Make it repeat…</button>
              </>
            )}
          </div>
        </div>
      </div>
    </StudioScope>
  );
}

function RuleRow({ label, hint, on, onClick }: { label: string; hint: string; on: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="min-w-0 flex-1"><span className="block text-[13px]">{label}</span><span className="block text-[11px] text-[var(--st-muted)]">{hint}</span></span>
      <Toggle on={on} onClick={onClick} label={label} />
    </div>
  );
}
