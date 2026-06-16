"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FluidSelect, type FluidOption } from "./fluid-select";
import { inlineUpdateTask } from "@/app/task/actions";
import { useToast } from "./toast";
import { callUndo } from "./undo-banner";
import type { TaskRow } from "@/lib/queries";

/* ------------------------------------------------------------------ *
 * TaskInlineStatus / TaskInlinePriority — glass FluidSelect popovers that
 * save a task's status / priority instantly (optimistic) with an Undo toast.
 *
 * These replace the old "click-then-wait" inline-edit for status + priority:
 * the FluidSelect is the shared Aurora menu (spring pop-in, dot + check, portal
 * positioning), and the save goes through the same inlineUpdateTask action +
 * undo-token wiring already used everywhere. Deadline keeps the existing
 * DeadlineEditor — do not rebuild it here.
 *
 * Drop either into a row/card/Overview header. They stop click propagation so
 * they don't open the drawer behind them.
 * ------------------------------------------------------------------ */

const STATUS_OPTIONS: FluidOption[] = [
  { value: "Not Started", label: "Not Started", dot: "hsl(var(--fg-subtle))" },
  { value: "In Progress", label: "In Progress", dot: "hsl(var(--info))" },
  { value: "Under Review", label: "Under Review", dot: "hsl(var(--warn))" },
  { value: "Waiting External", label: "Waiting External", dot: "hsl(var(--warn))" },
  { value: "Blocked", label: "Blocked", dot: "hsl(var(--danger))" },
  { value: "Escalated", label: "Escalated", dot: "hsl(var(--danger))" },
  { value: "Completed", label: "Completed", dot: "hsl(var(--success))" },
  { value: "Closed", label: "Closed", dot: "hsl(var(--success))" },
];

const PRIORITY_OPTIONS: FluidOption[] = [
  { value: "Critical", label: "Critical", dot: "hsl(var(--danger))" },
  { value: "High", label: "High", dot: "hsl(var(--warn))" },
  { value: "Medium", label: "Medium", dot: "hsl(var(--info))" },
  { value: "Low", label: "Low", dot: "hsl(var(--fg-subtle))" },
];

function useInlineField(code: string, field: "status" | "priority", label: string) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function save(value: string) {
    start(async () => {
      const res = await inlineUpdateTask(code, field, value);
      if (!res.ok) { toast(res.error || `Couldn't update ${label.toLowerCase()}.`, { tone: "danger" }); return; }
      toast(`${label} updated.`, {
        tone: "success",
        duration: 8000,
        action: res.undoToken ? {
          label: "Undo",
          onClick: async () => {
            const r = await callUndo(res.undoToken!);
            toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 });
            router.refresh();
          },
        } : undefined,
      });
      router.refresh();
    });
  }

  return { save, pending };
}

export function TaskInlineStatus({
  task,
  align = "left",
  buttonClassName,
}: {
  task: TaskRow;
  align?: "left" | "right";
  buttonClassName?: string;
}) {
  const { save, pending } = useInlineField(task.code, "status", "Status");
  return (
    <span onClick={(e) => e.stopPropagation()} className={pending ? "opacity-60 pointer-events-none" : undefined}>
      <FluidSelect
        value={task.status}
        options={STATUS_OPTIONS}
        onSelect={save}
        align={align}
        buttonClassName={buttonClassName}
      />
    </span>
  );
}

export function TaskInlinePriority({
  task,
  align = "left",
  buttonClassName,
}: {
  task: TaskRow;
  align?: "left" | "right";
  buttonClassName?: string;
}) {
  const { save, pending } = useInlineField(task.code, "priority", "Priority");
  return (
    <span onClick={(e) => e.stopPropagation()} className={pending ? "opacity-60 pointer-events-none" : undefined}>
      <FluidSelect
        value={task.priority}
        options={PRIORITY_OPTIONS}
        onSelect={save}
        align={align}
        buttonClassName={buttonClassName}
      />
    </span>
  );
}
