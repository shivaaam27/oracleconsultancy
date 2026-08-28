"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, Loader2, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { ACTION_DANGER, CONTROL_SHELL } from "@/components/ui";
import { cn } from "@/lib/cn";
import { portalEditTask } from "@/app/portal/actions";
import { TASK_EDIT_EVENT } from "@/components/portal-task-manage";

/**
 * The task's title and description — shown, and edited WHERE THEY SIT.
 *
 * ⚠️ IT USED TO OPEN BESIDE THE TITLE, and that was the whole complaint. The
 * Edit button lived in a `justify-between` row with the `<h1>`, so pressing it
 * put a full-width form in the right-hand half: measured at 1024px, the title
 * squeezed to 242px on the left while a 425px form sat next to it, and the old
 * description still ran underneath. You were shown the old and the new at once
 * and had to work out which was which.
 *
 * Now the heading BECOMES a field and the description BECOMES a field, in the
 * same place, at the same width. Nothing moves, nothing is duplicated, and the
 * page does not reflow around the act of editing.
 *
 * ⚠️ THE DESCRIPTION MOVED UP, next to the title it belongs to. It used to sit
 * below the dates and the people, which is why the two halves of one edit were
 * at opposite ends of the card.
 *
 * Posting goes through the role-checked `portalEditTask`; `canEdit` only decides
 * whether the pencil is offered — the server checks again either way.
 */
export function PortalTaskEdit({
  taskId, code, actionItem, description, canEdit,
}: {
  taskId: number;
  code: string;
  actionItem: string;
  description: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEdit] = useState(false);
  const [title, setTitle] = useState(actionItem);
  const [desc, setDesc] = useState(description);
  const [busy, start] = useTransition();

  /* ⚠️ EDITING IS ONE STATE FOR THE WHOLE TASK (owner, 28 Aug 2026). The pencil
     opens the fields here AND the Task settings panel below — priority, due
     date, people, delete — rather than leaving that a separate thing you had to
     find and expand yourself. Announced rather than passed down: the two sit in
     different branches of a server component's tree. */
  function setEditing(on: boolean) {
    setEdit(on);
    window.dispatchEvent(new CustomEvent(TASK_EDIT_EVENT, { detail: { editing: on } }));
  }

  function save() {
    const next = title.trim();
    if (!next) { toast("A task needs a title.", { tone: "danger" }); return; }
    start(async () => {
      const res = await portalEditTask({ taskId, actionItem: next, description: desc.trim() || null });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Task updated.", { tone: "success" });
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setTitle(actionItem);
    setDesc(description);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="mt-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 text-lg font-semibold leading-snug">{actionItem}</h1>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${code}`}
              title="Edit the title and description"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted ring-1 ring-border transition-colors hover:text-accent hover:ring-accent/40"
            >
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
        {description && (
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-fg-muted">{description}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      {/* Same box, same width, same place the heading was. */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        aria-label="Task title"
        autoFocus
        className={cn(CONTROL_SHELL, "h-auto w-full px-2.5 py-1.5 text-lg font-semibold leading-snug")}
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description (optional)"
        aria-label="Task description"
        rows={3}
        className={cn(CONTROL_SHELL, "mt-1.5 h-auto w-full resize-y px-2.5 py-1.5 text-sm")}
      />
      {/* ⚠️ THE BUTTONS SIT AT THE BOTTOM RIGHT OF WHAT THEY ACT ON (owner,
          28 Aug 2026). Left-aligned under the fields they read as the start of
          the next thing; on the right they close the block they belong to, which
          is where a form's buttons live everywhere else in COS.
          ⚠️ CANCEL IS AN OUTLINED, RED BUTTON, not bare text — it was the only
          control in the pair without a box, so the pair looked like one button
          and a link. Red because it throws away what you just typed. */}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          className={cn(ACTION_DANGER, "h-8 px-3 text-sm")}
        >
          <X size={13} /> Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
      </div>
    </div>
  );
}
