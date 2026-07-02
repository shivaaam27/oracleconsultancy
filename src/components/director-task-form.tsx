"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck, Plus, Loader2, CheckCircle2, Search, ChevronDown, Check,
  Building2, X, Star,
} from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { SwitchRow } from "@/components/ui";
import { NotifyPerson } from "@/components/notify-person";
import { PeoplePicker } from "@/components/people-picker";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { portalDirectorCreateTask, portalCreateTask } from "@/app/portal/actions";

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
 *  • director → multi-company fan-out, every active person in a
 *    searchable picker, an "Only I can close it" lock (default ON),
 *    posts to portalDirectorCreateTask (companyIds = the picked ids).
 *  • manager  → their single company, people limited as today, no
 *    multi-company / no creator-close toggle, posts to portalCreateTask.
 *
 * Kept the export name DirectorTaskForm so existing imports keep working.
 * ------------------------------------------------------------------ */
export function DirectorTaskForm({
  people, companies, role = "director",
  open: controlledOpen, onOpenChange, seedTitle,
  trigger,
}: {
  people: Person[]; companies: Company[];
  role?: ComposerRole;
  open?: boolean; onOpenChange?: (v: boolean) => void; seedTitle?: string;
  /** Custom open trigger (uncontrolled only). Defaults to a "New task" pill. */
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternalOpen(v); };

  const isDirector = role === "director";
  const createAction = isDirector ? portalDirectorCreateTask : portalCreateTask;

  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [responsibleIds, setResponsibleIds] = useState<number[]>([]);
  const [leadIds, setLeadIds] = useState<number[]>([]);
  const [priority, setPriority] = useState("Medium");
  const [requiresProof, setRequiresProof] = useState(false);
  const [creatorCloseOnly, setCreatorCloseOnly] = useState(isDirector); // default ON for directors
  const [assigned, setAssigned] = useState<{ id: number; name: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createAction, null);

  // For managers we keep a single company. Default it to their only company.
  const singleCompanyId = companyIds[0];
  useEffect(() => {
    if (!isDirector && companies.length === 1) setCompanyIds([companies[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirector, companies.length]);

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
    setCompanyIds(!isDirector && companies.length === 1 ? [companies[0].id] : []);
    setResponsibleIds([]);
    setLeadIds([]);
    setPriority("Medium");
    setRequiresProof(false);
    setCreatorCloseOnly(isDirector);
    setFormError(null);
  }

  // Manager people scoping mirrors the old behaviour: limit by the chosen
  // company. Directors see EVERYONE (no company-by-company filtering — that's
  // the hassle being removed).
  const peopleForPicker = useMemo(() => {
    if (isDirector) return people;
    if (singleCompanyId == null) return people;
    const scoped = people.filter((p) => personCompanyIds(p).includes(singleCompanyId));
    return scoped.length ? scoped : people;
  }, [isDirector, people, singleCompanyId]);

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
  const companySelected = isDirector ? companyIds.length > 0 : singleCompanyId != null;
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
      {/* Fan-out / single-company hidden fields. Directors send companyIds
          (CORE parses + fans out); managers send a single companyId. */}
      {isDirector ? (
        <input type="hidden" name="companyIds" value={companyIds.join(",")} />
      ) : (
        <input type="hidden" name="companyId" value={singleCompanyId ?? ""} />
      )}
      <input type="hidden" name="leadIds" value={leadIds.join(",")} />
      <input type="hidden" name="priority" value={priority} />
      {workingIds.map((id) => <input key={id} type="hidden" name="workingIds" value={id} />)}
      <input type="hidden" name="requiresAttachment" value={requiresProof ? "1" : ""} />
      {isDirector && <input type="hidden" name="creatorCloseOnly" value={creatorCloseOnly ? "1" : ""} />}

      <div>
        <label className={fieldLabel}>What needs to be done?</label>
        <input name="actionItem" required defaultValue={seedTitle ?? ""} autoFocus={!!seedTitle} placeholder="e.g. Renew the business licence" className={inputCls} />
      </div>

      <div>
        <label className={fieldLabel}>{isDirector ? "Companies" : "Company"}</label>
        {isDirector ? (
          <CompanyMultiSelect companies={companies} value={companyIds} onChange={setCompanyIds} />
        ) : companies.length > 1 ? (
          <FluidSelect
            value={singleCompanyId != null ? String(singleCompanyId) : ""}
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
            placeholder="Choose…"
            onSelect={(v) => { setCompanyIds(v ? [Number(v)] : []); setResponsibleIds([]); setLeadIds([]); }}
            buttonClassName={selectBtn}
          />
        ) : (
          <p className="rounded-xl bg-bg-subtle/60 px-3.5 py-3 text-sm text-fg ring-1 ring-border">{companies[0]?.name ?? "Your company"}</p>
        )}
        {isDirector && companyIds.length > 1 && (
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
          <label className={fieldLabel}>Deadline</label>
          <input name="deadline" type="date" className={inputCls} />
        </div>
      </div>

      <div>
        <label className={fieldLabel}>Instruction (optional)</label>
        <textarea name="instruction" rows={3} placeholder="Becomes the pinned brief on the task" className={inputCls} />
      </div>

      <SwitchRow label="Require proof to complete" hint="A file must be attached to finish this task" on={requiresProof} onChange={setRequiresProof} />
      {isDirector && (
        <SwitchRow label="Only I can close it" hint="Locks completion to you — others can't close it." on={creatorCloseOnly} onChange={setCreatorCloseOnly} />
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
              {isDirector && companyIds.length > 1 ? `Assign ${companyIds.length} tasks` : "Assign task"}
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

/* ── A compact, searchable multi-company checklist (chips below). ──────── */
function CompanyMultiSelect({
  companies, value, onChange,
}: {
  companies: Company[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const selected = value.filter((id) => byId.has(id));
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, q]);

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={selectBtn}>
        <span className="flex min-w-0 items-center gap-2">
          <Building2 size={15} className="shrink-0 text-fg-muted" />
          <span className={selected.length ? "text-fg" : "text-fg-muted"}>
            {selected.length === 0 ? "Choose one or more…" : selected.length === 1 ? byId.get(selected[0]) : `${selected.length} companies`}
          </span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {selected.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent ring-1 ring-accent/25">
              {byId.get(id)}
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${byId.get(id)}`} className="hover:opacity-70">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-lg">
          <label className="relative block border-b border-border/60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm placeholder:text-fg-muted focus:outline-none" />
          </label>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">No matches.</li>}
            {filtered.map((c) => {
              const on = value.includes(c.id);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => toggle(c.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-muted/60 ${on ? "text-accent" : "text-fg"}`}>
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ${on ? "bg-accent text-accent-fg ring-accent" : "ring-border"}`}>
                      {on && <Check size={11} />}
                    </span>
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

