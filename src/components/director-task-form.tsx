"use client";

import { useActionState, useState } from "react";
import { ClipboardCheck, Plus, X, Loader2 } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { portalDirectorCreateTask } from "@/app/portal/actions";

type Person = { id: number; name: string; companyId: number | null };
type Company = { id: number; name: string };

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const inputCls = "w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3 py-2.5 text-sm placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

/** Director-only: create & assign a task in any company, to any active person. */
export function DirectorTaskForm({ people, companies }: { people: Person[]; companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [state, action, pending] = useActionState(portalDirectorCreateTask, null);

  // When a company is picked, prefer its people for the responsible list (but
  // allow anyone — the server permits group-wide assignment).
  const scoped = companyId ? people.filter((p) => String(p.companyId) === companyId) : people;
  const peopleForPicker = scoped.length ? scoped : people;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 transition-opacity">
        <Plus size={15} /> New task
      </button>
    );
  }

  return (
    <Panel glass className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck size={15} className="text-accent" />
        <span className="text-sm font-semibold">Assign a task</span>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-fg-muted hover:text-fg"><X size={15} /></button>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <input name="actionItem" required placeholder="What needs to be done?" className={inputCls} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select name="companyId" required value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputCls}>
            <option value="" disabled>Company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="accountableId" required defaultValue="" className={inputCls}>
            <option value="" disabled>Responsible person…</option>
            {peopleForPicker.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="priority" defaultValue="Medium" className={inputCls}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input name="deadline" type="date" className={inputCls} />
        </div>
        <textarea name="instruction" rows={2} placeholder="Instruction (optional — becomes the pinned brief)" className={inputCls} />
        {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Assign task
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-fg-muted hover:text-fg px-2">Cancel</button>
        </div>
      </form>
    </Panel>
  );
}
