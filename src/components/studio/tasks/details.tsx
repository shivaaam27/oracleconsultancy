"use client";

/**
 * The Studio record's Details panel — every value edits WHERE IT IS
 * (owner, 24 Sept 2026: "I want to be able to edit when I click the field
 * naturally"). Click a value and it becomes its own control: a pick-list, a
 * calendar, a people picker, a text box. Nothing sends you to a form.
 *
 * ⚠️ ONE WRITER. Every change goes through `patchTaskField` →
 * `updateTaskCore` (a PATCH: only the field you touched moves), except status,
 * priority and deadline, which keep their own inline paths — all of them are
 * audited and offer Undo. The full form still exists ("Edit every field at
 * once") for changing several things in one go.
 */
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat } from "lucide-react";
import { patchTaskField } from "@/app/task/actions";
import { callUndo } from "@/components/undo-banner";
import { useToast } from "@/components/toast";
import { DeadlineEditor } from "@/components/deadline-editor";
import { DatePopover } from "@/components/date-popover";
import { Combobox } from "@/components/combobox";
import { PersonPicker } from "@/components/person-picker";
import { StudioBlocker } from "./blocker";
import { StudioStatusCell, StudioPriorityCell, StudioChoiceMenu } from "./cells";
import { stBtn } from "@/components/studio/kit";
import { RISKS, CATEGORIES } from "@/lib/constants";
import { taskHref } from "@/lib/task-href";
import { cn } from "@/lib/cn";

export type DetailsTask = {
  id: number;
  code: string;
  companyId: number;
  companyName: string;
  assignees: string[];
  status: string;
  priority: string;
  deadline: Date | string | null;
  daysToDeadline: number | "done" | null;
  meetingDate: Date | string | null;
  risk: string | null;
  escalation: string | null;
  department: string | null;
  category: string | null;
  comments: string | null;
  accountability: string | null;
  requiresAttachment: boolean | null;
  blockedOnPersonId: number | null;
  blockedReason: string | null;
};

type Patch = Parameters<typeof patchTaskField>[1];

const RISK_DOT: Record<string, string> = { Critical: "#E0479E", High: "#F5A524", Medium: "#2490EF", Low: "#B9BBBF" };
const toYmd = (d: Date | string | null) => {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : new Date(x.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
};

export function StudioDetails({
  task: t, done, companies, people, departments, recurrenceLabel, onChanged, onOpenRepeat, onOpenForm,
}: {
  task: DetailsTask;
  done: boolean;
  companies: { id: number; name: string }[];
  people: { id: number; name: string }[];
  departments: string[];
  recurrenceLabel: string | null;
  onChanged: () => void;
  onOpenRepeat: () => void;
  onOpenForm: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [editing, setEditing] = useState<"accountable" | "about" | "department" | null>(null);

  function save(patch: Patch, what: string) {
    start(async () => {
      const res = await patchTaskField(t.code, patch);
      if (!res.ok) { toast(res.error || "Couldn't save that.", { tone: "warn" }); return; }
      setEditing(null);
      toast(`${what} saved.`, {
        tone: "success",
        duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); onChanged(); } } : undefined,
      });
      // Moving the company re-issues the code: follow it to its new address.
      if (res.code && res.code !== t.code) router.replace(taskHref(res.code));
      else onChanged();
    });
  }

  const late = typeof t.daysToDeadline === "number" && t.daysToDeadline < 0 ? Math.abs(t.daysToDeadline) : 0;
  const leadMode = t.accountability === "lead";

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          Details{busy && <Loader2 size={12} className="animate-spin text-[var(--st-muted)]" />}
        </div>
        <span className="text-[11px] text-[var(--st-muted)]">Click any value to change it</span>
      </div>

      <Row label="Company" hint="Changing it issues a new task code">
        <StudioChoiceMenu
          value={String(t.companyId)}
          options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          onPick={(v) => { if (Number(v) !== t.companyId) save({ companyId: Number(v) }, "Company"); }}
          showDot={false}
          width={260}
          title="Move the task to another company"
        />
      </Row>

      <Row label="Accountable" top={editing === "accountable"}>
        {editing === "accountable" ? (
          <PeopleEditor
            people={people}
            initial={t.assignees}
            onSave={(names) => save({ assigneeNames: names }, "People")}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Value onClick={() => setEditing("accountable")} title="Change who is on it">
            {t.assignees.length ? t.assignees.join(", ") : <Muted>Nobody yet</Muted>}
          </Value>
        )}
      </Row>

      <Row label="Status"><StudioStatusCell code={t.code} status={t.status} /></Row>
      <Row label="Priority"><StudioPriorityCell code={t.code} priority={t.priority} /></Row>
      <Row label="Deadline" hint={late ? `${late} ${late === 1 ? "day" : "days"} late` : undefined}>
        <DeadlineEditor code={t.code} deadline={t.deadline ? new Date(t.deadline) : null} daysToDeadline={t.daysToDeadline} studio="date" />
      </Row>
      <Row label="Waiting on" top>
        <StudioBlocker taskId={t.id} closed={done} blockedOnPersonId={t.blockedOnPersonId} blockedReason={t.blockedReason} people={people} onChanged={onChanged} />
      </Row>

      <Row label="Meeting date">
        <DatePopover
          value={toYmd(t.meetingDate)}
          onChange={(v) => save({ meetingDate: v || null }, "Meeting date")}
          triggerClassName="-mx-1.5 inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[13px] transition-colors hover:bg-[var(--st-page)]"
          label={t.meetingDate ? null : "Not set"}
          tone={t.meetingDate ? "text-[var(--st-ink)]" : "text-[var(--st-muted)]"}
        />
      </Row>

      <Row label="Risk">
        <StudioChoiceMenu
          value={t.risk}
          options={[...RISKS.map((r) => ({ value: r, label: r, dot: RISK_DOT[r] })), ...(t.risk ? [{ value: "", label: "Clear it", muted: true }] : [])]}
          onPick={(v) => { if (v !== (t.risk ?? "")) save({ risk: v || null }, "Risk"); }}
          title="Set the risk"
        />
      </Row>

      <Row label="Escalation">
        <StudioChoiceMenu
          value={t.escalation === "Yes" ? "Yes" : "No"}
          options={[{ value: "Yes", label: "Escalated", dot: "#F0703A" }, { value: "No", label: "Not escalated", dot: "#B9BBBF" }]}
          onPick={(v) => { if (v !== (t.escalation === "Yes" ? "Yes" : "No")) save({ escalation: v as "Yes" | "No" }, "Escalation"); }}
          title="Escalate it, or take the escalation off"
        />
      </Row>

      <Row label="Department">
        {editing === "department" ? (
          <div onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}>
            <Combobox
              options={departments}
              defaultValue={t.department ?? ""}
              placeholder="Pick, or type a new one"
              onCommit={(v) => { const next = v.trim() || null; if (next !== (t.department ?? null)) save({ departmentName: next }, "Department"); else setEditing(null); }}
            />
          </div>
        ) : (
          <Value onClick={() => setEditing("department")} title="Set the department">
            {t.department || <Muted>Not set</Muted>}
          </Value>
        )}
      </Row>

      <Row label="Category">
        <StudioChoiceMenu
          value={t.category}
          options={[...CATEGORIES.map((c) => ({ value: c, label: c })), ...(t.category ? [{ value: "", label: "Clear it", muted: true }] : [])]}
          onPick={(v) => { if (v !== (t.category ?? "")) save({ category: v || null }, "Category"); }}
          showDot={false}
          title="Set the category"
        />
      </Row>

      <Row label="About" top>
        {editing === "about" ? (
          <AboutEditor
            initial={t.comments ?? ""}
            onSave={(text) => save({ comments: text.trim() || null }, "Description")}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Value onClick={() => setEditing("about")} title="Write what this task is about">
            {t.comments?.trim() ? <span className="line-clamp-4 whitespace-pre-wrap break-words">{t.comments}</span> : <Muted>Add a description</Muted>}
          </Value>
        )}
      </Row>

      <div className="mb-1 mt-5 text-[15px] font-semibold">Rules</div>
      <Rule
        label="First person is the lead"
        hint="Only the lead has to finish it"
        on={leadMode}
        onToggle={() => save({ accountability: leadMode ? "shared" : "lead" }, "Rule")}
      />
      <Rule
        label="Needs a file to complete"
        hint="Staff can’t close it without attaching proof"
        on={!!t.requiresAttachment}
        onToggle={() => save({ requiresAttachment: !t.requiresAttachment }, "Rule")}
      />
      <button type="button" onClick={onOpenRepeat} className={cn(stBtn.ghost, "mt-3 h-9 w-full justify-center text-xs")}>
        <Repeat size={13} />{recurrenceLabel ? `Repeats — ${recurrenceLabel}` : "Make it repeat…"}
      </button>
      <button type="button" onClick={onOpenForm} className="mt-2 w-full text-center text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">
        Change several fields at once
      </button>
    </div>
  );
}

function Row({ label, hint, top, children }: { label: string; hint?: ReactNode; top?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid grid-cols-[88px_minmax(0,1fr)] gap-2.5 border-b border-[var(--st-line-soft)] py-2.5 last:border-b-0 xl:grid-cols-[100px_minmax(0,1fr)] xl:gap-3", top ? "items-start" : "items-center")}>
      <span className={cn("text-[13px] text-[var(--st-muted)]", top && "pt-0.5")}>{label}</span>
      <div className="min-w-0 text-[13px]">
        {children}
        {hint && <div className="text-[11px] text-[var(--st-muted)]">{hint}</div>}
      </div>
    </div>
  );
}

function Value({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className="-mx-1.5 block w-[calc(100%+12px)] min-w-0 rounded-md px-1.5 py-0.5 text-left text-[13px] transition-colors hover:bg-[var(--st-page)]">
      {children}
    </button>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-[var(--st-muted)]">{children}</span>;
}

function Rule({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex w-full items-center gap-3 py-2 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">{label}</span>
        <span className="block text-[11px] text-[var(--st-muted)]">{hint}</span>
      </span>
      <span aria-hidden className={cn("relative h-5 w-[34px] shrink-0 rounded-full transition-colors", on ? "bg-[var(--st-ink)]" : "bg-[#D6D6D2]")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left]", on ? "left-4" : "left-0.5")} />
      </span>
    </button>
  );
}

function PeopleEditor({ people, initial, onSave, onCancel }: { people: { id: number; name: string }[]; initial: string[]; onSave: (names: string[]) => void; onCancel: () => void }) {
  const [csv, setCsv] = useState(initial.join(", "));
  return (
    <div className="space-y-2" onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <PersonPicker people={people} defaultNames={initial} name="__studio_people" onChange={setCsv} placeholder="Search people…" />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onSave(csv.split(",").map((s) => s.trim()).filter(Boolean))} className={cn(stBtn.dark, "h-8 px-3 text-xs")}>Save</button>
        <button type="button" onClick={onCancel} className="text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Cancel</button>
      </div>
    </div>
  );
}

function AboutEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  return (
    <div className="space-y-2">
      <textarea
        ref={ref}
        defaultValue={initial}
        rows={4}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(ref.current?.value ?? ""); }
        }}
        placeholder="What is this task about?"
        className="bare-field w-full resize-y rounded-[10px] border border-[var(--st-line)] bg-[var(--st-page)] px-2.5 py-2 text-[13px] outline-none focus:border-[var(--st-muted)]"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onSave(ref.current?.value ?? "")} className={cn(stBtn.dark, "h-8 px-3 text-xs")}>Save</button>
        <button type="button" onClick={onCancel} className="text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Cancel</button>
        <span className="ml-auto text-[11px] text-[var(--st-muted)]">Ctrl+Enter saves</span>
      </div>
    </div>
  );
}
