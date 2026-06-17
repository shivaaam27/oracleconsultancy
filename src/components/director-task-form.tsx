"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Plus, Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { portalDirectorCreateTask } from "@/app/portal/actions";

type Person = { id: number; name: string; companyId: number | null };
type Company = { id: number; name: string };

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const inputCls = "w-full rounded-xl bg-bg-subtle/70 ring-1 ring-border px-3.5 py-3 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";
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
  const [state, action, pending] = useActionState(portalDirectorCreateTask, null);

  // Close once the create completes without an error.
  const prevPending = useRef(false);
  useEffect(() => {
    if (prevPending.current && !pending && !state?.error) setOpen(false);
    prevPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

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
        onClose={() => setOpen(false)}
        title="Assign a task"
        icon={<ClipboardCheck size={17} />}
        footer={
          <button
            type="submit"
            form={FORM_ID}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />} Assign task
          </button>
        }
      >
        <form id={FORM_ID} action={action} className="flex flex-col gap-3.5">
          <div>
            <label className={fieldLabel}>What needs to be done?</label>
            <input name="actionItem" required defaultValue={seedTitle ?? ""} autoFocus={!!seedTitle} placeholder="e.g. Renew the business licence" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Company</label>
              <select name="companyId" required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputCls}>
                <option value="" disabled>Choose…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Responsible person</label>
              <select name="accountableId" required defaultValue="" className={inputCls}>
                <option value="" disabled>Choose…</option>
                {peopleForPicker.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>Priority</label>
              <select name="priority" defaultValue="Medium" className={inputCls}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
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
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        </form>
      </BottomSheet>
    </>
  );
}
