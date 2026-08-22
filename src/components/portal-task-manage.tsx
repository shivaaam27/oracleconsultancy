"use client";

import { CONTROL_SHELL } from "@/components/ui";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { useRouter } from "next/navigation";
import { ChevronDown, Building2, Flag, SlidersHorizontal } from "lucide-react";
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

const OPEN_KEY = "portal.manageTask.open";

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
  // Remembered per browser, like the density and text-size choices.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === "1"); } catch { /* private mode */ }
  }, []);

  const changePriority = (v: string) => { if (v !== cmd.priority) save({ priority: v }, `Priority → ${v}`); };
  const changeDue = (v: string) => { if (v !== (cmd.deadlineInput ?? "")) save({ deadline: v || null }, "Due date updated"); };

  return (
    <div className="flex flex-col gap-2">
      {/* A DISCLOSURE, shut to begin with.
       *
       * Everything below is a setting, and settings are not why anyone opens a
       * task — they open it to read what happened and to say something back.
       * Left open it put ~780px of controls between the task and its
       * conversation. Shut, the record reads: what it is, what you can do, what
       * was said. Your choice is remembered, so anyone who does live in here
       * opens it once. */}
      <button
        type="button"
        onClick={() => { setOpen(!open); try { localStorage.setItem(OPEN_KEY, open ? "0" : "1"); } catch { /* private mode */ } }}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md text-left"
      >
        <SectionLabel icon={<SlidersHorizontal size={13} />}>Manage task</SectionLabel>
        <ChevronDown size={14} className={cn("ml-auto shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      {/* A field LIST, not a stack of cards.
       *
       * Each setting used to be a label on its own line above a full-width
       * control, inside a card with 16px padding and 16px between blocks — five
       * settings came to roughly 900px of screen, which is what "manage task
       * looks huge" was. They are rows now: the name on the left, the control on
       * the right, a hairline between them — the same shape a record's field
       * section has in the command centre. It stacks on a phone, where a row
       * genuinely has no room for both. */}
      {open && (
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-elev">
        {canEdit && (
          <ManageRow icon={<Flag size={12} />} label="Priority & due">
            <FluidSelect value={cmd.priority} options={priorityOptions} onSelect={changePriority} className="min-w-[7.5rem] flex-1 sm:w-[136px] sm:flex-none" buttonClassName="h-8 w-full rounded-md border border-border bg-bg px-2.5 text-sm" />
            <span className="min-w-[7.5rem] flex-1 sm:w-[150px] sm:flex-none">
              <DatePopover value={cmd.deadlineInput} label={cmd.dueLabel} tone={cmd.overdue ? "text-danger" : cmd.withinSoon ? "text-warn" : "text-fg-muted"} onChange={changeDue} block />
            </span>
          </ManageRow>
        )}

        {/* The task's own company is locked; tick another to create a copy there
            (fan-out). Group director / HR only. */}
        {canEdit && companies.length > 1 && (
          <ManageRow icon={<Building2 size={12} />} label="Companies">
            <span className="w-full sm:w-[240px]">
              <TaskCopyToCompanies taskId={cmd.taskId} currentCompanyId={cmd.companyId} currentCompanyName={cmd.companyName} companies={companies} />
            </span>
          </ManageRow>
        )}

        {canEdit && (
          <div className="px-3 py-2.5">
            <TaskClassifyControls t={cmd} />
          </div>
        )}

        <div className="px-3 py-2.5">
          <TaskPeoplePanel t={cmd} people={people} canEditLeads={canEdit} canRemind={canRemind} />
        </div>

        {canEdit && (
          <div className="px-3 py-2.5">
            <TaskDeleteFooter taskId={cmd.taskId} code={cmd.code} onDeleted={() => router.push("/portal/tasks")} />
          </div>
        )}
      </div>
      )}
    </div>
  );
}

/** One setting: its name on the left, its control(s) on the right. Stacks below
 *  `sm`, where a row cannot hold both and still be readable. */
function ManageRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-fg-muted">
        {icon} {label}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">{children}</span>
    </div>
  );
}
