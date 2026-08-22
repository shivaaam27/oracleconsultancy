"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, Loader2, X } from "lucide-react";
import { useToast } from "@/components/toast";
import { portalEditTask } from "@/app/portal/actions";

/* Inline title + description editor for the full portal task page. Shown only to
 * those who may edit the task (a director/HR or its creator — gated by the page).
 * Posts through the role-checked portalEditTask, then refreshes. */
export function PortalTaskEdit({
  taskId, code, actionItem, description,
}: {
  taskId: number;
  code: string;
  actionItem: string;
  description: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(actionItem);
  const [desc, setDesc] = useState(description);
  const [busy, start] = useTransition();

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
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${code}`}
        title="Edit title & description"
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted ring-1 ring-border transition-colors hover:text-accent hover:ring-accent/40"
      >
        <Pencil size={13} /> Edit
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl bg-bg-subtle/50 p-3 ring-1 ring-border">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        className="w-full rounded-lg bg-bg-elev px-3 py-2 text-sm font-medium ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description (optional)"
        rows={3}
        className="w-full resize-y rounded-lg bg-bg-elev px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-base font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
        <button type="button" onClick={cancel} className="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-base text-fg-muted transition-colors hover:text-fg">
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}
