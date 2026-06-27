"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardCheck, Plus, Loader2, CheckCircle2, Search, ChevronDown, Check,
  Building2, X,
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

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_OPTIONS: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p }));
const inputCls = "bare-field w-full rounded-xl ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40 caret-accent";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
const selectBtn = "bare-field flex w-full items-center justify-between rounded-xl ring-1 ring-border px-3.5 py-3 text-sm";
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
  const [accountableId, setAccountableId] = useState<string>("");
  const [workingIds, setWorkingIds] = useState<number[]>([]);
  const [priority, setPriority] = useState("Medium");
  const [requiresProof, setRequiresProof] = useState(false);
  const [creatorCloseOnly, setCreatorCloseOnly] = useState(isDirector); // default ON for directors
  const [assigned, setAssigned] = useState<{ id: number; name: string } | null>(null);
  const [state, action, pending] = useActionState(createAction, null);

  // For managers we keep a single company. Default it to their only company.
  const singleCompanyId = companyIds[0];
  useEffect(() => {
    if (!isDirector && companies.length === 1) setCompanyIds([companies[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirector, companies.length]);

  // On a clean create, swap the form for a "notify them?" step instead of closing.
  const prevPending = useRef(false);
  useEffect(() => {
    if (prevPending.current && !pending && !state?.error) {
      const p = people.find((x) => x.id === Number(accountableId));
      if (p) setAssigned({ id: p.id, name: p.name });
      else setOpen(false);
    }
    prevPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function close() {
    setOpen(false);
    setAssigned(null);
    setCompanyIds(!isDirector && companies.length === 1 ? [companies[0].id] : []);
    setAccountableId("");
    setWorkingIds([]);
    setPriority("Medium");
    setRequiresProof(false);
    setCreatorCloseOnly(isDirector);
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

  // "Also working" excludes whoever is the responsible person.
  const workingPeople = useMemo(
    () => peopleForPicker.filter((p) => String(p.id) !== accountableId),
    [peopleForPicker, accountableId],
  );

  const fields = (
    <form id={FORM_ID} action={action} className="flex flex-col gap-3.5">
      {/* Fan-out / single-company hidden fields. Directors send companyIds
          (CORE parses + fans out); managers send a single companyId. */}
      {isDirector ? (
        <input type="hidden" name="companyIds" value={companyIds.join(",")} />
      ) : (
        <input type="hidden" name="companyId" value={singleCompanyId ?? ""} />
      )}
      <input type="hidden" name="accountableId" value={accountableId} />
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
            onSelect={(v) => { setCompanyIds(v ? [Number(v)] : []); setAccountableId(""); setWorkingIds([]); }}
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
        <label className={fieldLabel}>Responsible person</label>
        <PersonSelect
          people={peopleForPicker}
          value={accountableId ? Number(accountableId) : null}
          onChange={(id) => {
            setAccountableId(id != null ? String(id) : "");
            if (id != null) setWorkingIds((ids) => ids.filter((x) => x !== id));
          }}
          placeholder="Choose someone…"
        />
      </div>

      {workingPeople.length > 0 && (
        <div>
          <label className={fieldLabel}>Also working on it (optional)</label>
          <PeoplePicker
            people={workingPeople}
            value={workingIds.filter((id) => id !== Number(accountableId))}
            onChange={setWorkingIds}
            emptyLabel="Add people (optional)"
          />
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

      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
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
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
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

/* ── A searchable single-select for the responsible person. Same look as
 *    PeoplePicker but picks exactly one. ──────────────────────────────── */
function PersonSelect({
  people, value, onChange, placeholder = "Choose…",
}: {
  people: Person[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
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

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return people;
    return people.filter((p) => p.name.toLowerCase().includes(term));
  }, [people, q]);

  function pick(id: number) {
    onChange(id === value ? null : id);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={selectBtn}>
        <span className={value != null ? "text-fg" : "text-fg-muted"}>{value != null ? byId.get(value) ?? placeholder : placeholder}</span>
        <ChevronDown size={15} className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-lg">
          <label className="relative block border-b border-border/60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm placeholder:text-fg-muted focus:outline-none" />
          </label>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">No matches.</li>}
            {filtered.map((p) => {
              const on = p.id === value;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-muted/60 ${on ? "text-accent" : "text-fg"}`}>
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ${on ? "bg-accent text-accent-fg ring-accent" : "ring-border"}`}>
                      {on && <Check size={11} />}
                    </span>
                    {p.name}
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
