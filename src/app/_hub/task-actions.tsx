"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useContextActions } from "@/components/context-actions";
import { QuickTaskPopover, type QuickTaskCompany } from "@/components/quick-task-popover";

/**
 * Task Management quick-create host.
 *
 * Registers the page's `+` contextual action (the nav-pill page action) to open
 * the Aurora `QuickTaskPopover` — 1-to-2-touch create (Action · Company ·
 * Assignee · Deadline), with a quiet "Full form →" link to /task/new (the
 * existing intercepting modal is left intact). Also renders an inline
 * "Add a task…" affordance at the top of the list via {@link AddTaskInline},
 * which shares the same popover state.
 */
export function TaskActions({
  companies,
  people,
  defaultCompanyId,
  showInline = true,
}: {
  companies: QuickTaskCompany[];
  people: string[];
  defaultCompanyId?: number;
  /** Show the inline "Add a task…" row (hidden for calendar/timeline views). */
  showInline?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useContextActions(
    "tasks",
    [
      {
        id: "new-task",
        label: "New Task",
        icon: <Plus size={16} />,
        onClick: () => setOpen(true),
        primary: true,
        tone: "accent",
      },
    ],
    [pathname]
  );

  return (
    <>
      {/* Inline "Add a task…" — second entry point to the same popover, so the
          list always has a calm, glanceable way to start a task. */}
      {showInline && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-border/70 bg-bg-subtle/40 px-3.5 py-2.5 text-left text-sm text-fg-muted transition-colors hover:border-accent/40 hover:bg-bg-muted/50 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
            <Plus size={15} />
          </span>
          <span>Add a task…</span>
          <span className="ml-auto hidden text-[11px] text-fg-subtle sm:inline">Action · Company · Assignee · Deadline</span>
        </button>
      )}

      <QuickTaskPopover
        open={open}
        onClose={() => setOpen(false)}
        companies={companies}
        people={people}
        defaultCompanyId={defaultCompanyId}
      />
    </>
  );
}
