"use client";

// Portal "Recurring tasks" panel — a compact Aurora section on the portal Tasks
// page (managers/directors/HR, cap-gated on `recurringTasks`) listing the standing
// recurring_task automations THIS person created, with add/edit/delete. Mirrors the
// task-composer's own "Repeat" section (director-task-form.tsx) so the two stay
// visually consistent; server-side every action re-verifies ownership + the cap
// (see src/app/portal/(app)/tasks/automations-actions.ts).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { BottomSheet } from "@/components/bottom-sheet";
import { FluidSelect } from "@/components/fluid-select";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import type { PickerCompany, PickerPerson } from "@/lib/portal-picker";
import { Switch } from "@/components/ui";
import {
  portalCreateRecurringTask, portalUpdateRecurringTask, portalDeleteRecurringTask, portalSetRecurringTaskPaused,
  type RecurringTaskRule, type RecurringTaskInput,
} from "@/app/portal/(app)/tasks/automations-actions";

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];
const DAY_CHIPS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" },
  { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];
const DAY_LABEL: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

const inputCls = "w-full rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm text-fg placeholder:text-fg-muted transition-colors hover:ring-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40";
const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";

type Draft = {
  title: string;
  companyName: string;
  cadence: "weekly" | "monthly";
  weekdays: number[];
  dayOfMonth: number;
  priority: string;
  status: string;
  assigneeNames: string[];
  description: string;
};

const BLANK: Draft = {
  title: "", companyName: "", cadence: "weekly", weekdays: [1], dayOfMonth: 1,
  priority: "Medium", status: "Not Started", assigneeNames: [], description: "",
};

function scheduleLabel(r: Pick<RecurringTaskRule, "cadence" | "weekdays" | "dayOfMonth">): string {
  if (r.cadence === "monthly") {
    const d = r.dayOfMonth ?? 1;
    return `Day ${d} of each month`;
  }
  return [...r.weekdays].sort().map((w) => DAY_LABEL[w]).join(", ");
}

export function PortalRecurringTasks({
  rules, companies, people,
}: {
  rules: RecurringTaskRule[];
  companies: PickerCompany[];
  people: PickerPerson[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [d, setD] = useState<Draft>(BLANK);
  const [busy, start] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const companyByName = new Map(companies.map((c) => [c.name, c.id]));
  const personByName = new Map(people.map((p) => [p.name, p.id]));

  function openNew() {
    setEditingId(null);
    setD({ ...BLANK, companyName: companies.length === 1 ? companies[0].name : "" });
    setOpen(true);
  }

  function openEdit(r: RecurringTaskRule) {
    setEditingId(r.id);
    setD({
      title: r.title,
      companyName: companies.find((c) => c.id === r.companyId)?.name ?? "",
      cadence: r.cadence,
      weekdays: r.weekdays.length ? r.weekdays : [1],
      dayOfMonth: r.dayOfMonth ?? 1,
      priority: r.priority,
      status: r.status,
      assigneeNames: r.assigneePersonIds.map((id) => people.find((p) => p.id === id)?.name).filter((n): n is string => !!n),
      description: r.description,
    });
    setOpen(true);
  }

  const canSubmit = d.title.trim().length > 0 && companyByName.has(d.companyName) && (d.cadence === "monthly" || d.weekdays.length > 0);

  function save() {
    const input: RecurringTaskInput = {
      title: d.title.trim(),
      companyId: companyByName.get(d.companyName) ?? 0,
      cadence: d.cadence,
      weekdays: d.weekdays,
      dayOfMonth: d.dayOfMonth,
      priority: d.priority,
      status: d.status,
      description: d.description.trim(),
      assigneePersonIds: d.assigneeNames.map((n) => personByName.get(n)).filter((x): x is number => typeof x === "number"),
    };
    start(async () => {
      const res = editingId != null ? await portalUpdateRecurringTask(editingId, input) : await portalCreateRecurringTask(input);
      if (!res.ok) { toast(res.error ?? "Could not save.", { tone: "danger" }); return; }
      toast(editingId != null ? "Recurring task updated." : "Recurring task saved.", { tone: "success" });
      setOpen(false);
      router.refresh();
    });
  }

  function remove(id: number) {
    setDeletingId(id);
    start(async () => {
      const res = await portalDeleteRecurringTask(id);
      setDeletingId(null);
      if (!res.ok) { toast(res.error ?? "Could not remove it.", { tone: "danger" }); return; }
      toast("Recurring task removed.", { tone: "success" });
      router.refresh();
    });
  }

  // The on/off switch — pauses the rule (settings kept) rather than deleting it.
  const [togglingId, setTogglingId] = useState<number | null>(null);
  function togglePaused(r: RecurringTaskRule) {
    setTogglingId(r.id);
    start(async () => {
      const res = await portalSetRecurringTaskPaused(r.id, !r.paused);
      setTogglingId(null);
      if (!res.ok) { toast(res.error ?? "Could not update it.", { tone: "danger" }); return; }
      toast(r.paused ? "Recurring task switched on." : "Recurring task switched off.", { tone: "success" });
      router.refresh();
    });
  }

  return (
    <Panel className="p-4">
      <SectionLabel
        icon={<Repeat size={13} />}
        action={
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg transition-transform active:scale-95"
          >
            <Plus size={13} /> Add
          </button>
        }
      >
        Recurring tasks
      </SectionLabel>

      {rules.length === 0 ? (
        <p className="mt-3 text-xs text-fg-muted">
          None yet — set a task to recreate itself automatically on chosen days each week or month.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-bg-subtle/60 px-3 py-2.5 ring-1 ring-border/60">
              <div className={`min-w-0 ${r.paused ? "opacity-50" : ""}`}>
                <p className="truncate text-sm font-medium text-fg">{r.title}</p>
                <p className="mt-0.5 text-[11px] text-fg-muted">
                  {scheduleLabel(r)} · {r.companyName || "—"}{r.paused ? " · Off" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => togglePaused(r)}
                  disabled={busy && togglingId === r.id}
                  role="switch"
                  aria-checked={!r.paused}
                  aria-label={r.paused ? "Switch on" : "Switch off"}
                  className="mr-1"
                >
                  <Switch on={!r.paused} size="sm" busy={busy && togglingId === r.id} />
                </button>
                <button type="button" onClick={() => openEdit(r)} className="grid h-7 w-7 place-items-center rounded-lg text-fg-muted hover:bg-bg-elev hover:text-fg" aria-label="Edit">
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={busy && deletingId === r.id}
                  className="grid h-7 w-7 place-items-center rounded-lg text-fg-muted hover:bg-danger/10 hover:text-danger"
                  aria-label="Remove"
                >
                  {busy && deletingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={editingId != null ? "Edit recurring task" : "New recurring task"}
        icon={<Repeat size={16} />}
        footer={
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={save}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Repeat size={15} />}
            {busy ? "Saving…" : "Save"}
          </button>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <label className={fieldLabel}>What needs to be done?</label>
            <input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Open the shop" className={inputCls} />
          </div>

          <div>
            <label className={fieldLabel}>Company</label>
            {companies.length > 1 ? (
              <Combobox options={companies.map((c) => c.name)} defaultValue={d.companyName} placeholder="Pick a company…" onCommit={(v) => set({ companyName: v })} onInput={(v) => set({ companyName: v })} />
            ) : (
              <p className="rounded-xl bg-bg-subtle/60 px-3.5 py-3 text-sm text-fg ring-1 ring-border">{companies[0]?.name ?? "Your company"}</p>
            )}
          </div>

          <div>
            <label className={fieldLabel}>Repeats</label>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={d.cadence === "weekly"} onClick={() => set({ cadence: "weekly" })}>Weekly</Chip>
              <Chip on={d.cadence === "monthly"} onClick={() => set({ cadence: "monthly" })}>Monthly</Chip>
            </div>
            {d.cadence === "weekly" ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DAY_CHIPS.map(({ v, l }) => (
                  <Chip key={v} on={d.weekdays.includes(v)} onClick={() => set({ weekdays: d.weekdays.includes(v) ? d.weekdays.filter((x) => x !== v) : [...d.weekdays, v] })}>
                    {l}
                  </Chip>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-fg-muted">Day of month</span>
                <input
                  type="number" min={1} max={31} value={d.dayOfMonth}
                  onChange={(e) => set({ dayOfMonth: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })}
                  className="w-16 rounded-lg bg-bg-elev px-2.5 py-1.5 text-sm ring-1 ring-border"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Priority</label>
              <FluidSelect value={d.priority} options={PRIORITIES.map((p) => ({ value: p, label: p }))} onSelect={(v) => set({ priority: v })} />
            </div>
            <div>
              <label className={fieldLabel}>Starting status</label>
              <FluidSelect value={d.status} options={STATUSES.map((s) => ({ value: s, label: s }))} onSelect={(v) => set({ status: v })} />
            </div>
          </div>

          <div>
            <label className={fieldLabel}>Assign to (optional)</label>
            <Combobox
              options={people.filter((p) => !d.assigneeNames.includes(p.name)).map((p) => p.name)}
              placeholder="Add people…"
              clearOnCommit
              onCommit={(v) => { if (personByName.has(v) && !d.assigneeNames.includes(v)) set({ assigneeNames: [...d.assigneeNames, v] }); }}
            />
            {d.assigneeNames.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {d.assigneeNames.map((n) => (
                  <button key={n} type="button" onClick={() => set({ assigneeNames: d.assigneeNames.filter((x) => x !== n) })}
                    className="rounded-lg bg-bg-subtle px-2 py-0.5 text-[11px] ring-1 ring-border hover:bg-danger/10 hover:text-danger">
                    {n} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={fieldLabel}>Description (optional)</label>
            <textarea value={d.description} onChange={(e) => set({ description: e.target.value })} rows={2} placeholder="Becomes the task's comments" className={inputCls} />
          </div>
        </div>
      </BottomSheet>
    </Panel>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs ring-1 transition-colors ${on ? "bg-accent/12 text-accent ring-accent/40 font-medium" : "bg-bg-elev text-fg-muted ring-border hover:text-fg"}`}
    >
      {children}
    </button>
  );
}
