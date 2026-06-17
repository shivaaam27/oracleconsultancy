"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, Bell, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "./toast";
import { CompleteTaskSheet } from "./complete-task-sheet";
import { portalRemindTask } from "@/app/portal/actions";

/* The per-task page quick-action bar: jump to posting an update, complete the
 * task through the secure gate (note required + proof if the task needs it),
 * and — for management — draft a reminder to the owner. */
export function TaskQuickActions({
  taskId, code, ownerName, canRemind, canComplete, requiresAttachment = false,
}: {
  taskId: number;
  code: string;
  ownerName: string | null;
  canRemind: boolean;
  canComplete: boolean;
  requiresAttachment?: boolean;
}) {
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [completeOpen, setCompleteOpen] = useState(false);

  function remind() {
    start(async () => {
      const res = await portalRemindTask(taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Reminder for ${res.name.split(" ")[0]} saved to Outbox.`, {
        tone: "success",
        action: res.link ? { label: "Send now", onClick: () => { window.open(res.link!, "_blank"); } } : undefined,
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href="#conversation"
        className="inline-flex min-w-[8rem] flex-1 items-center justify-center gap-1.5 rounded-2xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98]"
      >
        <MessageSquarePlus size={15} /> Add update
      </a>
      {canComplete && (
        <button
          type="button"
          onClick={() => setCompleteOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-success-soft px-4 py-3 text-sm font-medium text-success ring-1 ring-success/25 transition-transform active:scale-95"
        >
          <CheckCircle2 size={15} /> Complete
        </button>
      )}
      {canRemind && (
        <button
          type="button"
          onClick={remind}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-bg-elev px-4 py-3 text-sm font-medium text-fg ring-1 ring-border transition-transform hover:bg-bg-muted active:scale-95 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
          Remind{ownerName ? ` ${ownerName.split(" ")[0]}` : ""}
        </button>
      )}

      <CompleteTaskSheet open={completeOpen} onClose={() => setCompleteOpen(false)} taskId={taskId} code={code} requiresAttachment={requiresAttachment} />
    </div>
  );
}
