"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useContextActions } from "@/components/context-actions";
import { QuickTaskPopover, type QuickTaskCompany } from "@/components/quick-task-popover";
import { InlineAddTask } from "@/components/inline-add-task";

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

  // The page `+`: on list views it focuses the always-present inline add row
  // (one-step create); on calendar/timeline (no inline row) it opens the popover.
  useContextActions(
    "tasks",
    [
      {
        id: "new-task",
        label: "New Task",
        icon: <Plus size={16} />,
        onClick: () => {
          if (showInline) {
            const el = document.getElementById("inline-add-action") as HTMLInputElement | null;
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            el?.focus();
          } else {
            setOpen(true);
          }
        },
        primary: true,
        tone: "accent",
      },
    ],
    [pathname, showInline]
  );

  return (
    <>
      {/* Inline, one-step add — type the action, pick Company · Assignee ·
          Deadline as circles, Save. No popup. */}
      {showInline && (
        <InlineAddTask
          companies={companies}
          people={people}
          defaultCompanyId={defaultCompanyId}
        />
      )}

      {/* Popover fallback for views without the inline row (calendar/timeline). */}
      {!showInline && (
        <QuickTaskPopover
          open={open}
          onClose={() => setOpen(false)}
          companies={companies}
          people={people}
          defaultCompanyId={defaultCompanyId}
        />
      )}
    </>
  );
}
