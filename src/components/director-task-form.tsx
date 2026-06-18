"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Plus, Loader2, CheckCircle2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { SwitchRow } from "@/components/ui";
import { NotifyPerson } from "@/components/notify-person";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { portalDirectorCreateTask } from "@/app/portal/actions";

type Person = { id: number; name: string; companyId: number | null };
type Company = { id: number; name: string };

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_OPTIONS: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p }));
const inputCls = "bare-field w-full rounded-xl ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40 caret-accent";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
const selectBtn = "bare-field flex w-full items-center justify-between rounded-xl ring-1 ring-border px-3.5 py-3 text-sm";
const FORM_ID = "director-task-form";

/** Director-only: create & assign a task in any company, to any active person,
 *  as an iPhone bottom-sheet. Can be driven externally (controlled `open` +
 *  `seedTitle`) by the board's smart capture bar, or stand alone with its own
 *  "New task" trigger. */
export function DirectorTaskForm({
  people, companies, open: controlledOpen, onOpenChange, seedTitle,
}: {
  people: Person[]; companies: Company[];
  open?: boolean; onOpenChange?: (v: boolean) => void; seedTitle?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternalOpen(v); };

  const [companyId, setCompanyId] = useState<string>("");
  const [accountableId, setAccountableId] = useState<string>("");
  const [priority, setPriority] = useState("Medium");
  const [requiresProof, setRequiresProof] = useState(false);
  const [assigned, setAssigned] = useState<{ id: number; name: string } | null>(null);
  const [state, action, pending] = useActionState(portalDirectorCreateTask, null);

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
    setCompanyId("");
    setAccountableId("");
    setPriority("Medium");
  }

  const scoped = companyId ? people.filter((p) => String(p.companyId) === companyId) : people;
  const peopleForPicker = scoped.length ? scoped : people;

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
        >
          <Plus size={15} /> New task
        </button>
      )}

      <BottomSheet
        open={open}
        onClose={close}
        title={assigned ? "Task assigned" : "Assign a task"}
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
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} Assign task
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
        <form id={FORM_ID} action={action} className="flex flex-col gap-3.5">
          <div>
            <label className={fieldLabel}>What needs to be done?</label>
            <input name="actionItem" required defaultValue={seedTitle ?? ""} autoFocus={!!seedTitle} placeholder="e.g. Renew the business licence" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Company</label>
              <input type="hidden" name="companyId" value={companyId} />
              <FluidSelect value={companyId} options={companies.map((c) => ({ value: String(c.id), label: c.name }))} placeholder="Choose…" onSelect={(v) => { setCompanyId(v); setAccountableId(""); }} buttonClassName={selectBtn} />
            </div>
            <div>
              <label className={fieldLabel}>Responsible person</label>
              <input type="hidden" name="accountableId" value={accountableId} />
              <FluidSelect value={accountableId} options={peopleForPicker.map((p) => ({ value: String(p.id), label: p.name }))} placeholder="Choose…" onSelect={setAccountableId} buttonClassName={selectBtn} />
            </div>
            <div>
              <label className={fieldLabel}>Priority</label>
              <input type="hidden" name="priority" value={priority} />
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
          <input type="hidden" name="requiresAttachment" value={requiresProof ? "1" : ""} />
          <SwitchRow label="Require proof to complete" hint="A file must be attached to finish this task" on={requiresProof} onChange={setRequiresProof} />
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        </form>
        )}
      </BottomSheet>
    </>
  );
}
