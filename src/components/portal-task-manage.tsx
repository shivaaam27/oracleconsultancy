"use client";

import { CONTROL_SHELL } from "@/components/ui";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Flag, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/components/toast";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { DatePopover } from "@/components/date-popover";
import { TaskCopyToCompanies } from "@/components/task-copy-companies";
import { SectionLabel } from "@/components/surface-kit";
import {
  TaskPeoplePanel, TaskClassifyControls, TaskDeleteFooter, type CommandTask,
} from "@/components/portal-tasks-command";
import { portalEditTask } from "@/app/portal/actions";
import type { BoardPerson, BoardCompany } from "@/components/director-board-client";

/* Full-task-page management panel — the SAME controls the Tasks command card
 * offers, so a director gets identical power whether they open the card or the
 * full page (functionality unification). Priority + Due + Classify + Escalate +
 * add/remove people + delete, all wired to the shared portal actions. Only
 * rendered for those who may edit (canEdit); read-only viewers never see it. */

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_HEX: Record<string, string> = {
  Critical: "hsl(var(--danger))", High: "hsl(var(--warn))", Medium: "hsl(var(--accent))", Low: "hsl(var(--fg-subtle))",
};
const priorityOptions: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p, dot: PRIORITY_HEX[p] }));
// One shared control edge — see CONTROL_SHELL in ui.tsx.
const fieldShell = CONTROL_SHELL;

export function PortalTaskManage({
  cmd, people, companies, canEdit, canRemind,
}: {
  cmd: CommandTask;
  people: BoardPerson[];
  companies: BoardCompany[];
  canEdit: boolean;
  canRemind: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [, start] = useTransition();

  function save(patch: { priority?: string; deadline?: string | null }, label: string) {
    start(async () => {
      const res = await portalEditTask({ taskId: cmd.taskId, ...patch });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(label, { tone: "success" });
      router.refresh();
    });
  }
  const changePriority = (v: string) => { if (v !== cmd.priority) save({ priority: v }, `Priority → ${v}`); };
  const changeDue = (v: string) => { if (v !== (cmd.deadlineInput ?? "")) save({ deadline: v || null }, "Due date updated"); };

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel icon={<SlidersHorizontal size={13} />}>Manage task</SectionLabel>
      <div className="flex flex-col gap-4 rounded-2xl glass elevated p-4">
        {/* Priority + Due */}
        {canEdit && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <span className="col-span-2 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle sm:col-span-1">
              <Flag size={12} /> Priority &amp; due
            </span>
            <FluidSelect value={cmd.priority} options={priorityOptions} onSelect={changePriority} className="w-full sm:w-[150px]" buttonClassName={`${fieldShell} w-full px-3 py-2 text-[12px]`} />
            <span className="w-full sm:w-[160px]">
              <DatePopover value={cmd.deadlineInput} label={cmd.dueLabel} tone={cmd.overdue ? "text-danger" : cmd.withinSoon ? "text-warn" : "text-fg-muted"} onChange={changeDue} block />
            </span>
          </div>
        )}

        {/* Companies — the task's own company is locked; tick another to create a
            copy there (fan-out). Group director / HR only. */}
        {canEdit && companies.length > 1 && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <span className="col-span-2 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle sm:col-span-1">
              <Building2 size={12} /> Companies
            </span>
            <span className="w-full sm:w-[240px]">
              <TaskCopyToCompanies taskId={cmd.taskId} currentCompanyId={cmd.companyId} currentCompanyName={cmd.companyName} companies={companies} />
            </span>
          </div>
        )}

        {/* Classify + Escalate (shared) */}
        {canEdit && <TaskClassifyControls t={cmd} />}

        {/* People — add / remove / lead (shared) */}
        <TaskPeoplePanel t={cmd} people={people} canEditLeads={canEdit} canRemind={canRemind} />

        {/* Delete the whole task — navigate back to the list afterwards. */}
        {canEdit && <TaskDeleteFooter taskId={cmd.taskId} code={cmd.code} onDeleted={() => router.push("/portal/tasks")} />}
      </div>
    </div>
  );
}
