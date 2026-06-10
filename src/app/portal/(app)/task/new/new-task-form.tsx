"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { portalCreateTask } from "../../../actions";

type Person = { id: number; name: string };
type Company = { id: number; name: string };

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const inputCls = "w-full rounded-2xl bg-bg-subtle ring-1 ring-border px-3.5 py-2.5 text-sm outline-none focus:ring-accent/50";

export function NewTaskForm({ me, people, companies }: { me: Person; people: Person[]; companies: Company[] }) {
  const [state, action, pending] = useActionState(portalCreateTask, null);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/portal" className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors">
        <ArrowLeft size={15} /> My tasks
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">New task</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Delegate work to yourself or your team.</p>
      </div>

      <Panel glass className="p-4 sm:p-5">
        <form action={action} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Task</span>
            <input name="actionItem" required placeholder="What needs to be done?" className={inputCls} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Company</span>
              <select name="companyId" required defaultValue={companies[0]?.id ?? ""} className={inputCls}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Priority</span>
              <select name="priority" defaultValue="Medium" className={inputCls}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Deadline</span>
              <input name="deadline" type="date" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Accountable</span>
              <select name="accountableId" defaultValue={me.id} className={inputCls}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.id === me.id ? "Me" : p.name}</option>
                ))}
              </select>
            </label>
          </div>

          {people.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Also working on it</span>
              <div className="flex flex-wrap gap-1.5">
                {people.filter((p) => p.id !== me.id).map((p) => (
                  <label key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle ring-1 ring-border px-3 py-1.5 text-sm cursor-pointer hover:ring-accent/40">
                    <input type="checkbox" name="workingIds" value={p.id} className="accent-[var(--accent)]" />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Instruction (pinned)</span>
            <textarea name="instruction" rows={3} placeholder="Optional — the first instruction, pinned to the top." className={inputCls + " resize-y"} />
          </label>

          {state?.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-accent text-accent-fg px-4 py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
          >
            <ClipboardCheck size={16} />
            {pending ? "Creating…" : "Create task"}
          </button>
        </form>
      </Panel>
    </div>
  );
}
