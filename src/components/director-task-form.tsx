"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck, Plus, Loader2, CheckCircle2, Star, RefreshCw, ChevronDown,
} from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { SwitchRow } from "@/components/ui";
import { NotifyPerson } from "@/components/notify-person";
import { PeoplePicker } from "@/components/people-picker";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { DatePopover } from "@/components/date-popover";
import { CompanyMultiSelect } from "@/components/company-multi-select";
import { FIELD_TRIGGER } from "@/components/date-time-field";
import { portalDirectorCreateTask } from "@/app/portal/actions";

type Person = { id: number; name: string; companyId: number | null; companyIds?: number[] };
type Company = { id: number; name: string };
export type ComposerRole = "director" | "manager";

/** Companies a person belongs to — their primary company plus any extra links. */
function personCompanyIds(p: Person): number[] {
  if (p.companyIds && p.companyIds.length) return p.companyIds;
  return p.companyId != null ? [p.companyId] : [];
}

// Leading titles to skip so a chip reads the given name ("Pulin"), not "Mr".
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "eng", "chef", "capt", "sir", "madam", "mx", "rev", "hon"]);
/** Name words with any leading honorific dropped. */
function nameParts(name: string): string[] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1 && HONORIFICS.has(parts[0].replace(/\.$/, "").toLowerCase())) return parts.slice(1);
  return parts;
}

/** First given name (skipping a leading honorific), for the compact lead chips. */
function firstName(name: string): string {
  return nameParts(name)[0] || name;
}

/** Up to two initials for a chip avatar (skipping a leading honorific). */
function initials(name: string): string {
  const parts = nameParts(name);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_OPTIONS: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p }));
// Open statuses only — the portal composer never creates a task straight into
// Completed/Closed (that's a status MOVE, done later, not a creation choice).
const OPEN_STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
const STATUS_OPTIONS: FluidOption[] = OPEN_STATUSES.map((s) => ({ value: s, label: s }));
const DAY_CHIPS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" },
  { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];
// Every field is a defined, filled box (matching the Responsible-people picker)
// so none of them read as "invisible" on the sheet.
const inputCls = "w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm text-fg placeholder:text-fg-muted transition-colors hover:ring-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
const selectBtn = "flex w-full items-center justify-between rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm transition-colors hover:ring-accent/40";
const FORM_ID = "director-task-form";

/* ------------------------------------------------------------------ *
 * The ONE task composer, shared by the board's smart-capture bar, the
 * Tasks page Quick-add, and the pill "New task" page. It's an iPhone
 * bottom-sheet, role-adaptive:
 *
 *  • director → multi-company fan-out across the portfolio, "Only I can
 *    close it" lock (default ON).
 *  • manager  → multi-company fan-out across THEIR companies (no creator-
 *    close toggle).
 * Both post to portalDirectorCreateTask, which enforces scope server-side via
 * companyScope; people are scoped to the selected companies.
 *
 * Kept the export name DirectorTaskForm so existing imports keep working.
 * ------------------------------------------------------------------ */
export function DirectorTaskForm({
  people, companies, role = "director",
  open: controlledOpen, onOpenChange, seedTitle,
  trigger, canRepeat = true,
}: {
  people: Person[]; companies: Company[];
  role?: ComposerRole;
  open?: boolean; onOpenChange?: (v: boolean) => void; seedTitle?: string;
  /** Custom open trigger (uncontrolled only). Defaults to a "New task" pill. */
  trigger?: (open: () => void) => React.ReactNode;
  /** me.caps.recurringTasks — shows the "Repeat" section. Defaults to true so
   *  callers that haven't threaded the cap through yet keep today's behaviour;
   *  the server re-checks the cap regardless of what this shows. */
  canRepeat?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternalOpen(v); };

  const isDirector = role === "director";
  // Every management role now posts through the ONE fan-out action; server-side
  // scope (companyScope) decides which companies/people are allowed, so a manager
  // fans out across THEIR companies just like a director does across the portfolio.
  const createAction = portalDirectorCreateTask;

  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [responsibleIds, setResponsibleIds] = useState<number[]>([]);
  const [leadIds, setLeadIds] = useState<number[]>([]);
  const [priority, setPriority] = useState("Medium");
  const [status, setStatus] = useState("Not Started"); // open statuses only — never Completed/Closed on creation
  const [deadline, setDeadline] = useState(""); // "yyyy-mm-dd" or "" — mirrored to a hidden input
  const [requiresProof, setRequiresProof] = useState(false);
  const [creatorCloseOnly, setCreatorCloseOnly] = useState(isDirector); // default ON for directors
  const [assigned, setAssigned] = useState<{ id: number; name: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createAction, null);

  // "Repeat" — cap-gated (recurringTasks). Alongside today's task, saves a
  // standing recurring_task rule so future copies auto-create on the chosen
  // days/date (server-side in portalDirectorCreateTask).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatOn, setRepeatOn] = useState(false);
  const [repeatCadence, setRepeatCadence] = useState<"weekly" | "monthly">("weekly");
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([1]);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState(1);

  // Everyone can fan out across the companies they're allowed. Auto-select the
  // only company when a person has just one (nothing to choose).
  useEffect(() => {
    if (companies.length === 1) setCompanyIds([companies[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies.length]);

  // On a clean create, swap the form for a "notify them?" step instead of closing.
  // The notify prompt targets the first lead.
  const prevPending = useRef(false);
  useEffect(() => {
    if (prevPending.current && !pending && !state?.error) {
      const p = people.find((x) => x.id === leadIds[0]);
      if (p) setAssigned({ id: p.id, name: p.name });
      else setOpen(false);
    }
    prevPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  // Keep the lead set valid as the responsible people change:
  //  • drop any lead who's no longer responsible;
  //  • if nobody's a lead but people are selected, default to the first one.
  useEffect(() => {
    setLeadIds((cur) => {
      const kept = cur.filter((id) => responsibleIds.includes(id));
      if (kept.length === 0 && responsibleIds.length > 0) return [responsibleIds[0]];
      return kept.length === cur.length ? cur : kept;
    });
  }, [responsibleIds]);

  function close() {
    setOpen(false);
    setAssigned(null);
    setCompanyIds(companies.length === 1 ? [companies[0].id] : []);
    setResponsibleIds([]);
    setLeadIds([]);
    setPriority("Medium");
    setStatus("Not Started");
    setDeadline("");
    setRequiresProof(false);
    setCreatorCloseOnly(isDirector);
    setFormError(null);
    setRepeatOpen(false);
    setRepeatOn(false);
    setRepeatCadence("weekly");
    setRepeatWeekdays([1]);
    setRepeatDayOfMonth(1);
  }

  // Responsible-people list is scoped to the SELECTED companies (for BOTH roles)
  // so the picker stays short and relevant — pick a company, then only its people
  // show. Before any company is chosen we show the full list (the picker isn't
  // useful empty). If a selected company has no linked people, fall back to the
  // full list rather than an empty picker. A person linked to several companies
  // appears when ANY of their companies is selected.
  const peopleForPicker = useMemo(() => {
    if (companyIds.length === 0) return people;
    const scoped = people.filter((p) => personCompanyIds(p).some((cid) => companyIds.includes(cid)));
    return scoped.length ? scoped : people;
  }, [people, companyIds]);

  // When the selected companies change, drop any already-picked person who no
  // longer belongs to the remaining companies (the lead-cleanup effect below then
  // re-defaults the lead).
  useEffect(() => {
    const allowed = new Set(peopleForPicker.map((p) => p.id));
    setResponsibleIds((cur) => {
      const kept = cur.filter((id) => allowed.has(id));
      return kept.length === cur.length ? cur : kept;
    });
  }, [peopleForPicker]);

  // The non-lead responsible people post as the "working" set.
  const workingIds = useMemo(
    () => responsibleIds.filter((id) => !leadIds.includes(id)),
    [responsibleIds, leadIds],
  );

  // Selected responsible people, in selection order, for the lead chips.
  const selectedPeople = useMemo(() => {
    const byId = new Map(peopleForPicker.map((p) => [p.id, p]));
    return responsibleIds.map((id) => byId.get(id)).filter((p): p is Person => !!p);
  }, [peopleForPicker, responsibleIds]);

  // The contract: a task can only exist with at least one company AND at least
  // one responsible person (with a lead). Managers have a single company.
  const companySelected = companyIds.length > 0;
  const canSubmit = companySelected && responsibleIds.length > 0 && leadIds.length > 0;

  /** The friendly "what's still missing" line shown when someone taps a greyed
   *  Assign button. */
  function missingMessage(): string {
    const missing: string[] = [];
    if (!companySelected) missing.push("one company");
    if (responsibleIds.length === 0) missing.push("one responsible person");
    else if (leadIds.length === 0) missing.push("a lead");
    return `Add at least ${missing.join(" and ")} to assign this task.`;
  }

  // Clear the inline guard message as soon as the selection is valid again.
  useEffect(() => { if (canSubmit) setFormError(null); }, [canSubmit]);

  // Toggle a person's lead flag. Never leave zero leads: turning off the last
  // lead re-defaults to the first remaining responsible person.
  function toggleLead(id: number) {
    setLeadIds((cur) => {
      if (cur.includes(id)) {
        const next = cur.filter((x) => x !== id);
        if (next.length === 0) {
          const fallback = responsibleIds.find((x) => x !== id);
          return fallback != null ? [fallback] : cur;
        }
        return next;
      }
      return [...cur, id];
    });
  }

  const fields = (
    <form
      id={FORM_ID}
      action={action}
      onSubmit={(e) => {
        // Guard the contract: at least one company AND one responsible person + lead.
        if (!canSubmit) { e.preventDefault(); setFormError(missingMessage()); }
      }}
      className="flex flex-col gap-3.5"
    >
      {/* Every role sends companyIds; the server fans out one task per company. */}
      <input type="hidden" name="companyIds" value={companyIds.join(",")} />
      <input type="hidden" name="leadIds" value={leadIds.join(",")} />
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="status" value={status} />
      {workingIds.map((id) => <input key={id} type="hidden" name="workingIds" value={id} />)}
      <input type="hidden" name="requiresAttachment" value={requiresProof ? "1" : ""} />
      {isDirector && <input type="hidden" name="creatorCloseOnly" value={creatorCloseOnly ? "1" : ""} />}
      {canRepeat && (
        <>
          <input type="hidden" name="repeatOn" value={repeatOn ? "1" : ""} />
          <input type="hidden" name="repeatCadence" value={repeatCadence} />
          <input type="hidden" name="repeatWeekdays" value={repeatWeekdays.join(",")} />
          <input type="hidden" name="repeatDayOfMonth" value={String(repeatDayOfMonth)} />
        </>
      )}

      <div>
        <label className={fieldLabel}>What needs to be done?</label>
        <input name="actionItem" required defaultValue={seedTitle ?? ""} autoFocus={!!seedTitle} placeholder="e.g. Renew the business licence" className={inputCls} />
      </div>

      <div>
        <label className={fieldLabel}>{companyIds.length > 1 ? "Companies" : "Company"}</label>
        {companies.length > 1 ? (
          // One searchable chooser for everyone — pick one OR several of the
          // companies you're allowed; a task is created per company.
          <CompanyMultiSelect companies={companies} value={companyIds} onChange={setCompanyIds} />
        ) : (
          <p className="rounded-xl bg-bg-subtle/60 px-3.5 py-3 text-sm text-fg ring-1 ring-border">{companies[0]?.name ?? "Your company"}</p>
        )}
        {companyIds.length > 1 && (
          <p className="mt-1.5 text-[11px] text-accent">Creates {companyIds.length} tasks — one per company</p>
        )}
      </div>

      <div>
        <label className={fieldLabel}>Responsible people</label>
        <PeoplePicker
          people={peopleForPicker}
          value={responsibleIds}
          onChange={setResponsibleIds}
          emptyLabel="Choose who's on it…"
        />
      </div>

      {selectedPeople.length > 0 && (
        <div>
          <label className={fieldLabel}>Who's the lead?</label>
          <div className="flex flex-wrap gap-1.5">
            {selectedPeople.map((p) => {
              const lead = leadIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleLead(p.id)}
                  aria-pressed={lead}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors ${
                    lead
                      ? "bg-accent-soft text-accent ring-accent/30"
                      : "bg-bg-subtle text-fg-muted ring-border hover:ring-accent/40"
                  }`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-medium ${lead ? "bg-accent text-accent-fg" : "bg-bg-muted text-fg-muted"}`}>
                    {initials(p.name)}
                  </span>
                  {firstName(p.name)}
                  <Star size={12} className={lead ? "fill-accent text-accent" : "text-fg-muted"} />
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-fg-muted">Tap a star to set the lead. At least one is required.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <label className={fieldLabel}>Priority</label>
          <FluidSelect value={priority} options={PRIORITY_OPTIONS} onSelect={setPriority} buttonClassName={selectBtn} />
        </div>
        <div>
          <label className={fieldLabel}>Status</label>
          {/* Open statuses only — a task can never be created straight into
              Completed/Closed from the portal. */}
          <FluidSelect value={status} options={STATUS_OPTIONS} onSelect={setStatus} buttonClassName={selectBtn} />
        </div>
      </div>

      <div>
        <label className={fieldLabel}>Deadline</label>
        {/* Aurora calendar (matches the edit views). It mirrors its value into a
            hidden input so the existing server action still reads `deadline`. */}
        <input type="hidden" name="deadline" value={deadline} />
        <DatePopover value={deadline || null} onChange={setDeadline} block triggerClassName={FIELD_TRIGGER} />
      </div>

      <div>
        <label className={fieldLabel}>Instruction (optional)</label>
        <textarea name="instruction" rows={3} placeholder="Becomes the pinned brief on the task" className={inputCls} />
      </div>

      <SwitchRow label="Require proof to complete" hint="A file must be attached to finish this task" on={requiresProof} onChange={setRequiresProof} />
      {isDirector && (
        <SwitchRow label="Only I can close it" hint="Locks completion to you — others can't close it." on={creatorCloseOnly} onChange={setCreatorCloseOnly} />
      )}

      {canRepeat && (
        <div className="rounded-xl bg-bg-subtle/50 ring-1 ring-border/70 overflow-hidden">
          <button
            type="button"
            onClick={() => setRepeatOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              <RefreshCw size={14} className="text-fg-muted" /> Repeat
            </span>
            <span className="flex items-center gap-2 text-fg-subtle">
              {repeatOn && <span className="text-[11px] text-accent">On</span>}
              <ChevronDown size={14} className={`transition-transform ${repeatOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {repeatOpen && (
            <div className="px-3.5 pb-3.5 space-y-2.5">
              <SwitchRow label="Recreate this task automatically" hint="Saves a standing rule alongside today's task" on={repeatOn} onChange={setRepeatOn} />
              {repeatOn && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {(["weekly", "monthly"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setRepeatCadence(c)}
                        aria-pressed={repeatCadence === c}
                        className={`rounded-lg px-2.5 py-1.5 text-xs capitalize ring-1 transition-colors ${repeatCadence === c ? "bg-accent/12 text-accent ring-accent/40 font-medium" : "bg-bg-elev text-fg-muted ring-border hover:text-fg"}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {repeatCadence === "weekly" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_CHIPS.map(({ v, l }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setRepeatWeekdays((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))}
                          aria-pressed={repeatWeekdays.includes(v)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs ring-1 transition-colors ${repeatWeekdays.includes(v) ? "bg-accent/12 text-accent ring-accent/40 font-medium" : "bg-bg-elev text-fg-muted ring-border hover:text-fg"}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-fg-muted">Day of month</span>
                      <input
                        type="number" min={1} max={31} value={repeatDayOfMonth}
                        onChange={(e) => setRepeatDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                        className="w-16 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {(formError || state?.error) && <p className="text-xs text-danger">{formError ?? state?.error}</p>}
    </form>
  );

  return (
    <>
      {!isControlled && (
        trigger ? trigger(() => setOpen(true)) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
          >
            <Plus size={15} /> New task
          </button>
        )
      )}

      <BottomSheet
        open={open}
        onClose={close}
        title={assigned ? "Task assigned" : isDirector ? "Assign a task" : "Add a task"}
        icon={assigned ? <CheckCircle2 size={17} /> : <ClipboardCheck size={17} />}
        footer={
          assigned ? (
            <button
              type="button"
              onClick={close}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-bg-subtle py-3 text-sm font-medium text-fg ring-1 ring-border transition-transform active:scale-[0.98]"
            >
              Done
            </button>
          ) : (
            <button
              type="submit"
              form={FORM_ID}
              disabled={pending}
              aria-disabled={!canSubmit}
              className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 ${!canSubmit ? "opacity-60" : ""}`}
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}{" "}
              {companyIds.length > 1 ? `Assign ${companyIds.length} tasks` : "Assign task"}
            </button>
          )
        }
      >
        {assigned ? (
          <div className="flex flex-col items-center gap-3 py-5 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
              <CheckCircle2 size={22} />
            </span>
            <div>
              <p className="text-sm font-medium">Assigned to {assigned.name}</p>
              <p className="mt-0.5 text-xs text-fg-muted">Send {assigned.name.split(" ")[0]} a summary of all their open tasks?</p>
            </div>
            <NotifyPerson personId={assigned.id} name={assigned.name} className="justify-center" />
          </div>
        ) : (
          fields
        )}
      </BottomSheet>
    </>
  );
}
